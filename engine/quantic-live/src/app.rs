use std::{
    fs,
    path::PathBuf,
    process::Child,
    time::{Duration, Instant},
};

use eframe::egui::{self, TextureHandle};

use crate::{
    ffmpeg,
    model::{Encoder, ProjectState, Source, SourceKind},
};

const CONFIG_FILE: &str = "quantic-live.json";

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
        }
    }

    pub(crate) fn save(&mut self) {
        self.refresh_runtime_status();
        match serde_json::to_string_pretty(&self.project)
            .ok()
            .and_then(|json| fs::write(CONFIG_FILE, json).ok())
        {
            Some(_) => self.status = "Configuration sauvegardée".into(),
            None => self.status = "Impossible de sauvegarder la configuration".into(),
        }
    }

    pub(crate) fn refresh_runtime_status(&mut self) {
        self.ffmpeg_ok = ffmpeg::ffmpeg_available(&self.project.settings.ffmpeg_path);
        self.detected_encoder = if self.ffmpeg_ok {
            ffmpeg::detect_encoder(&self.project.settings.ffmpeg_path)
        } else {
            Encoder::X264
        };
    }

    pub(crate) fn toggle_preview(&mut self) {
        if let Some(mut preview) = self.preview.take() {
            preview.stop();
            self.preview_texture = None;
            self.status = "Aperçu arrêté".into();
            return;
        }

        match ffmpeg::PreviewEngine::start(&self.project.settings) {
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

        match ffmpeg::start_stream(&self.project.settings) {
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

        match ffmpeg::start_recording(&self.project.settings) {
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

    pub(crate) fn add_source(&mut self, kind: SourceKind) {
        let Some(scene) = self.project.scenes.get_mut(self.project.selected_scene) else { return };
        let id = scene.sources.iter().map(|s| s.id).max().unwrap_or(0) + 1;
        scene.sources.push(Source {
            id,
            name: format!("{} {}", kind.label(), id),
            kind,
            visible: true,
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
            let _ = fs::write(CONFIG_FILE, json);
        }
    }
}

impl eframe::App for QuanticLiveApp {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        self.poll_children();
        self.update_preview(&ctx);
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
    fs::read_to_string(CONFIG_FILE)
        .ok()
        .and_then(|data| serde_json::from_str(&data).ok())
}
