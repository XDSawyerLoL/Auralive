use std::{
    fs,
    path::PathBuf,
    process::Child,
    time::{Duration, Instant},
};

use eframe::egui::{self, TextureHandle};

use crate::{
    control,
    ffmpeg,
    model::{Encoder, ProjectState, Source, SourceKind, SourceTransform},
};

pub struct QuanticLiveApp {
    pub(crate) project: ProjectState,
    pub(crate) preview: Option<ffmpeg::PreviewEngine>,
    pub(crate) preview_texture: Option<TextureHandle>,
    pub(crate) stream_process: Option<Child>,
    pub(crate) record_process: Option<Child>,
    pub(crate) recording_file: Option<PathBuf>,
    pub(crate) status: String,
    pub(crate) settings_open: bool,
    pub(crate) add_source_open: bool,
    pub(crate) ffmpeg_ok: bool,
    pub(crate) detected_encoder: Encoder,
    last_texture_update: Instant,
    last_control_poll: Instant,
    last_status_write: Instant,
    last_command_id: u64,
}

impl QuanticLiveApp {
    pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
        crate::ui_helpers::configure_style(&cc.egui_ctx);
        let project = load_project().unwrap_or_default();
        let ffmpeg_ok = ffmpeg::ffmpeg_available(&project.settings.ffmpeg_path);
        let detected_encoder = if ffmpeg_ok {
            ffmpeg::detect_encoder(&project.settings.ffmpeg_path)
        } else {
            Encoder::X264
        };
        Self {
            project,
            preview: None,
            preview_texture: None,
            stream_process: None,
            record_process: None,
            recording_file: None,
            status: "Prêt".into(),
            settings_open: false,
            add_source_open: false,
            ffmpeg_ok,
            detected_encoder,
            last_texture_update: Instant::now(),
            last_control_poll: Instant::now(),
            last_status_write: Instant::now(),
            last_command_id: 0,
        }
    }

    pub(crate) fn save(&mut self) {
        self.refresh_runtime_status();
        if self.persist_project() {
            self.status = "Configuration sauvegardée".into();
        } else {
            self.status = "Impossible de sauvegarder la configuration".into();
        }
    }

    fn persist_project(&self) -> bool {
        let config_path = control::config_path();
        control::ensure_parent(&config_path);
        serde_json::to_string_pretty(&self.project)
            .ok()
            .and_then(|json| fs::write(&config_path, json).ok())
            .is_some()
    }

    pub(crate) fn refresh_runtime_status(&mut self) {
        self.ffmpeg_ok = ffmpeg::ffmpeg_available(&self.project.settings.ffmpeg_path);
        self.detected_encoder = if self.ffmpeg_ok {
            ffmpeg::detect_encoder(&self.project.settings.ffmpeg_path)
        } else {
            Encoder::X264
        };
    }

    fn active_desktop_layout(&self) -> (Option<SourceTransform>, bool) {
        let Some(scene) = self.project.scenes.get(self.project.selected_scene) else {
            return (None, false);
        };
        let Some(source) = scene.sources.iter().find(|source| source.kind == SourceKind::Desktop) else {
            return (None, false);
        };
        (Some(source.transform.clone()), source.visible)
    }

    fn restart_preview(&mut self) {
        if let Some(mut preview) = self.preview.take() {
            preview.stop();
        }
        self.preview_texture = None;
        let (transform, visible) = self.active_desktop_layout();
        match ffmpeg::PreviewEngine::start(
            &self.project.settings,
            transform.as_ref(),
            visible,
            control::preview_path(),
        ) {
            Ok(preview) => {
                self.preview = Some(preview);
                self.status = "Aperçu actualisé".into();
            }
            Err(err) => self.status = err.to_string(),
        }
    }

    pub(crate) fn toggle_preview(&mut self) {
        if let Some(mut preview) = self.preview.take() {
            preview.stop();
            self.preview_texture = None;
            if let Some(path) = control::preview_path() {
                let _ = fs::remove_file(path);
            }
            self.status = "Aperçu arrêté".into();
            return;
        }

        let (transform, visible) = self.active_desktop_layout();
        match ffmpeg::PreviewEngine::start(
            &self.project.settings,
            transform.as_ref(),
            visible,
            control::preview_path(),
        ) {
            Ok(preview) => {
                self.preview = Some(preview);
                self.status = "Aperçu actif".into();
            }
            Err(err) => self.status = err.to_string(),
        }
    }

    pub(crate) fn toggle_stream(&mut self) {
        if let Some(mut child) = self.stream_process.take() {
            ffmpeg::stop_gracefully(&mut child);
            self.status = "Direct arrêté".into();
            return;
        }

        let (transform, visible) = self.active_desktop_layout();
        match ffmpeg::start_stream(&self.project.settings, transform.as_ref(), visible) {
            Ok(child) => {
                self.stream_process = Some(child);
                self.status = "EN DIRECT".into();
            }
            Err(err) => self.status = err.to_string(),
        }
    }

    pub(crate) fn toggle_recording(&mut self) {
        if let Some(mut child) = self.record_process.take() {
            ffmpeg::stop_gracefully(&mut child);
            let path = self
                .recording_file
                .take()
                .map(|p| p.display().to_string())
                .unwrap_or_default();
            self.status = format!("Enregistrement terminé · {path}");
            return;
        }

        let (transform, visible) = self.active_desktop_layout();
        match ffmpeg::start_recording(&self.project.settings, transform.as_ref(), visible) {
            Ok((child, file)) => {
                self.record_process = Some(child);
                self.recording_file = Some(file);
                self.status = "Enregistrement en cours".into();
            }
            Err(err) => self.status = err.to_string(),
        }
    }

    fn poll_children(&mut self) {
        let stream_finished = self
            .stream_process
            .as_mut()
            .map(|child| matches!(child.try_wait(), Ok(Some(_))))
            .unwrap_or(false);
        if stream_finished {
            self.stream_process = None;
            self.status = "Le direct s’est arrêté. Vérifie FFmpeg et la clé RTMP.".into();
        }

        let record_finished = self
            .record_process
            .as_mut()
            .map(|child| matches!(child.try_wait(), Ok(Some(_))))
            .unwrap_or(false);
        if record_finished {
            self.record_process = None;
            self.status = "L’enregistrement s’est arrêté.".into();
        }
    }

    fn update_preview(&mut self, ctx: &egui::Context) {
        if self.last_texture_update.elapsed() < Duration::from_millis(60) {
            return;
        }
        self.last_texture_update = Instant::now();

        let Some(preview) = self.preview.as_mut() else { return };
        let mut latest = None;
        while let Ok(frame) = preview.rx.try_recv() {
            latest = Some(frame);
        }
        let Some(frame) = latest else { return };

        if let Ok(image) = image::load_from_memory(&frame) {
            let image = image.to_rgba8();
            let size = [image.width() as usize, image.height() as usize];
            let color_image = egui::ColorImage::from_rgba_unmultiplied(size, image.as_raw());
            self.preview_texture = Some(ctx.load_texture(
                "quantic-live-preview",
                color_image,
                egui::TextureOptions::LINEAR,
            ));
        }
    }

    fn poll_external_control(&mut self) {
        if self.last_control_poll.elapsed() < Duration::from_millis(100) {
            return;
        }
        self.last_control_poll = Instant::now();

        let Some(command) = control::read_command(self.last_command_id) else {
            return;
        };
        self.last_command_id = command.id;

        match command.action.as_str() {
            "stream.start" if self.stream_process.is_none() => self.toggle_stream(),
            "stream.stop" if self.stream_process.is_some() => self.toggle_stream(),
            "record.start" if self.record_process.is_none() => self.toggle_recording(),
            "record.stop" if self.record_process.is_some() => self.toggle_recording(),
            "preview.start" if self.preview.is_none() => self.toggle_preview(),
            "preview.stop" if self.preview.is_some() => self.toggle_preview(),
            "scene.select" => {
                if let Some(name) = command.value.as_deref() {
                    if let Some(index) = self
                        .project
                        .scenes
                        .iter()
                        .position(|scene| scene.name.eq_ignore_ascii_case(name))
                    {
                        self.project.selected_scene = index;
                        self.status = format!("Scène active · {}", self.project.scenes[index].name);
                        let _ = self.persist_project();
                        if self.preview.is_some() && self.stream_process.is_none() && self.record_process.is_none() {
                            self.restart_preview();
                        }
                    } else {
                        self.status = format!("Scène introuvable · {name}");
                    }
                }
            }
            "source.transform" => {
                if let Some(value) = command.value.as_deref() {
                    if let Ok(payload) = serde_json::from_str::<serde_json::Value>(value) {
                        let source_id = payload.get("id").and_then(|value| value.as_u64()).unwrap_or(0);
                        if let Some(scene) = self.project.scenes.get_mut(self.project.selected_scene) {
                            if let Some(source) = scene.sources.iter_mut().find(|source| source.id == source_id) {
                                let clamp = |value: f32| value.clamp(0.0, 1.0);
                                let x = payload.get("x").and_then(|value| value.as_f64()).unwrap_or(source.transform.x as f64) as f32;
                                let y = payload.get("y").and_then(|value| value.as_f64()).unwrap_or(source.transform.y as f64) as f32;
                                let width = payload.get("width").and_then(|value| value.as_f64()).unwrap_or(source.transform.width as f64) as f32;
                                let height = payload.get("height").and_then(|value| value.as_f64()).unwrap_or(source.transform.height as f64) as f32;
                                source.transform = SourceTransform {
                                    x: clamp(x),
                                    y: clamp(y),
                                    width: width.clamp(0.05, 1.0),
                                    height: height.clamp(0.05, 1.0),
                                };
                                if source.transform.x + source.transform.width > 1.0 {
                                    source.transform.x = (1.0 - source.transform.width).max(0.0);
                                }
                                if source.transform.y + source.transform.height > 1.0 {
                                    source.transform.y = (1.0 - source.transform.height).max(0.0);
                                }
                                self.status = format!("Source positionnée · {}", source.name);
                            }
                        }
                    }
                    let _ = self.persist_project();
                    if self.preview.is_some() && self.stream_process.is_none() && self.record_process.is_none() {
                        self.restart_preview();
                    }
                }
            }
            "source.visibility" => {
                if let Some(value) = command.value.as_deref() {
                    if let Ok(payload) = serde_json::from_str::<serde_json::Value>(value) {
                        let source_id = payload.get("id").and_then(|value| value.as_u64()).unwrap_or(0);
                        let visible = payload.get("visible").and_then(|value| value.as_bool()).unwrap_or(true);
                        if let Some(scene) = self.project.scenes.get_mut(self.project.selected_scene) {
                            if let Some(source) = scene.sources.iter_mut().find(|source| source.id == source_id) {
                                source.visible = visible;
                                self.status = if visible {
                                    format!("Source affichée · {}", source.name)
                                } else {
                                    format!("Source masquée · {}", source.name)
                                };
                            }
                        }
                    }
                    let _ = self.persist_project();
                    if self.preview.is_some() && self.stream_process.is_none() && self.record_process.is_none() {
                        self.restart_preview();
                    }
                }
            }
            "source.add" => {
                if let Some(value) = command.value.as_deref() {
                    if let Ok(payload) = serde_json::from_str::<serde_json::Value>(value) {
                        let kind_name = payload.get("kind").and_then(|value| value.as_str()).unwrap_or("");
                        if let Some(kind) = SourceKind::from_slug(kind_name) {
                            if let Some(scene) = self.project.scenes.get_mut(self.project.selected_scene) {
                                let id = scene.sources.iter().map(|source| source.id).max().unwrap_or(0) + 1;
                                let name = payload
                                    .get("name")
                                    .and_then(|value| value.as_str())
                                    .map(str::trim)
                                    .filter(|value| !value.is_empty())
                                    .map(str::to_owned)
                                    .unwrap_or_else(|| format!("{} {}", kind.label(), id));
                                let target = payload
                                    .get("target")
                                    .and_then(|value| value.as_str())
                                    .unwrap_or("")
                                    .trim()
                                    .to_owned();
                                let transform = if kind == SourceKind::Desktop {
                                    SourceTransform::default()
                                } else {
                                    SourceTransform {
                                        x: 0.65,
                                        y: 0.65,
                                        width: 0.30,
                                        height: 0.30,
                                    }
                                };
                                scene.sources.push(Source {
                                    id,
                                    name,
                                    kind,
                                    visible: true,
                                    transform,
                                    target,
                                });
                                self.status = format!("Source ajoutée · {}", scene.sources.last().map(|source| source.name.as_str()).unwrap_or(""));
                            }
                        }
                    }
                    let _ = self.persist_project();
                    if self.preview.is_some() && self.stream_process.is_none() && self.record_process.is_none() {
                        self.restart_preview();
                    }
                }
            }
            "source.configure" => {
                if let Some(value) = command.value.as_deref() {
                    if let Ok(payload) = serde_json::from_str::<serde_json::Value>(value) {
                        let source_id = payload.get("id").and_then(|value| value.as_u64()).unwrap_or(0);
                        if let Some(scene) = self.project.scenes.get_mut(self.project.selected_scene) {
                            if let Some(source) = scene.sources.iter_mut().find(|source| source.id == source_id) {
                                if let Some(name) = payload.get("name").and_then(|value| value.as_str()) {
                                    let name = name.trim();
                                    if !name.is_empty() {
                                        source.name = name.to_owned();
                                    }
                                }
                                if let Some(target) = payload.get("target").and_then(|value| value.as_str()) {
                                    source.target = target.trim().to_owned();
                                }
                                self.status = format!("Source configurée · {}", source.name);
                            }
                        }
                    }
                    let _ = self.persist_project();
                    if self.preview.is_some() && self.stream_process.is_none() && self.record_process.is_none() {
                        self.restart_preview();
                    }
                }
            }
            "source.remove" => {
                if let Some(value) = command.value.as_deref() {
                    if let Ok(payload) = serde_json::from_str::<serde_json::Value>(value) {
                        let source_id = payload.get("id").and_then(|value| value.as_u64()).unwrap_or(0);
                        if let Some(scene) = self.project.scenes.get_mut(self.project.selected_scene) {
                            let before = scene.sources.len();
                            scene.sources.retain(|source| source.id != source_id);
                            if scene.sources.len() != before {
                                self.status = format!("Source supprimée · {source_id}");
                            }
                        }
                    }
                    let _ = self.persist_project();
                    if self.preview.is_some() && self.stream_process.is_none() && self.record_process.is_none() {
                        self.restart_preview();
                    }
                }
            }
            "runtime.refresh" => {
                self.refresh_runtime_status();
                self.status = "État du moteur actualisé".into();
            }
            _ => {}
        }
    }

    fn write_external_status(&mut self) {
        if self.last_status_write.elapsed() < Duration::from_millis(250) {
            return;
        }
        self.last_status_write = Instant::now();

        let active_scene = self.project.scenes.get(self.project.selected_scene);
        let scene = active_scene.map(|scene| scene.name.as_str()).unwrap_or("");
        let scenes = self.project.scenes.iter().map(|scene| scene.name.clone()).collect();
        let sources = active_scene
            .map(|scene| {
                scene.sources
                    .iter()
                    .map(|source| control::SourceStatus {
                        id: source.id,
                        name: source.name.clone(),
                        kind: source.kind.label().to_owned(),
                        visible: source.visible,
                        transform: source.transform.clone(),
                        target: source.target.clone(),
                    })
                    .collect()
            })
            .unwrap_or_default();
        let encoder = self.detected_encoder.label();
        control::write_status(&control::EngineStatus {
            ok: true,
            engine: "aura-native-broadcast",
            version: "0.1.0",
            last_command_id: self.last_command_id,
            streaming: self.stream_process.is_some(),
            recording: self.record_process.is_some(),
            preview: self.preview.is_some(),
            scene,
            scenes,
            sources,
            mic_volume: self.project.mic_volume,
            desktop_volume: self.project.desktop_volume,
            mic_muted: self.project.mic_muted,
            desktop_muted: self.project.desktop_muted,
            canvas_width: self.project.settings.width,
            canvas_height: self.project.settings.height,
            ffmpeg_ok: self.ffmpeg_ok,
            encoder,
            message: &self.status,
        });
    }

    pub(crate) fn add_source(&mut self, kind: SourceKind) {
        let Some(scene) = self.project.scenes.get_mut(self.project.selected_scene) else { return };
        let id = scene.sources.iter().map(|s| s.id).max().unwrap_or(0) + 1;
        scene.sources.push(Source {
            id,
            name: format!("{} {}", kind.label(), id),
            kind,
            visible: true,
            transform: SourceTransform {
                x: 0.65,
                y: 0.65,
                width: 0.30,
                height: 0.30,
            },
            target: String::new(),
        });
        self.add_source_open = false;
    }
}

impl Drop for QuanticLiveApp {
    fn drop(&mut self) {
        if let Some(mut preview) = self.preview.take() {
            preview.stop();
        }
        if let Some(mut child) = self.stream_process.take() {
            ffmpeg::stop_gracefully(&mut child);
        }
        if let Some(mut child) = self.record_process.take() {
            ffmpeg::stop_gracefully(&mut child);
        }
        if let Ok(json) = serde_json::to_string_pretty(&self.project) {
            let config_path = control::config_path();
            control::ensure_parent(&config_path);
            let _ = fs::write(config_path, json);
        }
    }
}

impl eframe::App for QuanticLiveApp {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        self.poll_children();
        self.update_preview(&ctx);
        self.poll_external_control();
        self.write_external_status();
        ctx.request_repaint_after(Duration::from_millis(33));

        self.top_bar(ui);
        self.left_panel(ui);
        self.right_panel(ui);
        self.central(ui);
        self.settings_window(&ctx);
        self.add_source_window(&ctx);
    }
}

fn load_project() -> Option<ProjectState> {
    fs::read_to_string(control::config_path())
        .ok()
        .and_then(|data| serde_json::from_str(&data).ok())
}
