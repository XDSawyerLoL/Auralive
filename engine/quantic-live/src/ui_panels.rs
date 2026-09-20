use eframe::egui::{self, Color32, CornerRadius, RichText, Stroke, Vec2};

use crate::{
    app::QuanticLiveApp,
    model::Encoder,
    ui_helpers::{audio_strip, badge, fit_size, info_row, panel_frame, section_title, source_icon},
};

impl QuanticLiveApp {
    pub(crate) fn top_bar(&mut self, root: &mut egui::Ui) {
        egui::Panel::top("top_bar")
            .exact_size(68.0)
            .frame(panel_frame())
            .show(root, |ui| {
                ui.horizontal_centered(|ui| {
                    ui.add_space(10.0);
                    ui.label(RichText::new("◈").size(28.0).color(Color32::from_rgb(183, 148, 255)));
                    ui.label(RichText::new("AURA LIVE").strong().size(18.0));
                    ui.add_space(12.0);
                    badge(ui, "0.3 NATIVE");
                    let spacer = (ui.available_width() - 485.0).max(0.0);
                    ui.add_space(spacer);
                    if ui.button("Réglages").clicked() {
                        self.settings_open = true;
                    }
                    if ui.button("Sauvegarder").clicked() {
                        self.save();
                    }
                    let preview_label = if self.preview.is_some() { "Stop aperçu" } else { "Aperçu" };
                    if ui.button(preview_label).clicked() {
                        self.toggle_preview();
                    }
                    ui.add_space(8.0);
                });
            });
    }

    pub(crate) fn left_panel(&mut self, root: &mut egui::Ui) {
        egui::Panel::left("left_panel")
            .resizable(true)
            .default_size(260.0)
            .min_size(220.0)
            .frame(panel_frame())
            .show(root, |ui| {
                section_title(ui, "SCÈNES");
                ui.add_space(6.0);
                for index in 0..self.project.scenes.len() {
                    let selected = self.project.selected_scene == index;
                    let name = self.project.scenes[index].name.clone();
                    if ui.selectable_label(selected, format!("◉  {name}")).clicked() {
                        self.project.selected_scene = index;
                    }
                }
                ui.horizontal(|ui| {
                    if ui.small_button("＋").clicked() {
                        let id = self.project.scenes.len() as u64 + 1;
                        self.project.scenes.push(crate::model::Scene {
                            id,
                            name: format!("Scène {id}"),
                            sources: vec![],
                        });
                        self.project.selected_scene = self.project.scenes.len() - 1;
                    }
                    if ui.small_button("−").clicked() && self.project.scenes.len() > 1 {
                        self.project.scenes.remove(self.project.selected_scene);
                        self.project.selected_scene = self.project.selected_scene.min(self.project.scenes.len() - 1);
                    }
                });

                ui.add_space(22.0);
                section_title(ui, "SOURCES");
                ui.add_space(6.0);

                if let Some(scene) = self.project.scenes.get_mut(self.project.selected_scene) {
                    let mut remove_index = None;
                    for (index, source) in scene.sources.iter_mut().enumerate() {
                        ui.horizontal(|ui| {
                            ui.checkbox(&mut source.visible, "");
                            ui.label(format!("{}  {}", source_icon(&source.kind), source.name));
                            if ui.small_button("×").clicked() {
                                remove_index = Some(index);
                            }
                        });
                    }
                    if let Some(index) = remove_index {
                        scene.sources.remove(index);
                    }
                }

                ui.add_space(8.0);
                if ui.button("＋ Ajouter une source").clicked() {
                    self.add_source_open = true;
                }

                ui.with_layout(egui::Layout::bottom_up(egui::Align::LEFT), |ui| {
                    ui.add_space(12.0);
                    ui.label(RichText::new("Local-first · aucun compte requis").weak().size(11.0));
                });
            });
    }

    pub(crate) fn right_panel(&mut self, root: &mut egui::Ui) {
        egui::Panel::right("right_panel")
            .resizable(true)
            .default_size(300.0)
            .min_size(260.0)
            .frame(panel_frame())
            .show(root, |ui| {
                section_title(ui, "MIXEUR AUDIO");
                ui.add_space(10.0);
                audio_strip(ui, "Micro", &mut self.project.mic_volume, &mut self.project.mic_muted);
                ui.add_space(12.0);
                audio_strip(ui, "Son du PC", &mut self.project.desktop_volume, &mut self.project.desktop_muted);

                ui.add_space(28.0);
                section_title(ui, "SORTIE");
                ui.add_space(10.0);
                info_row(ui, "Résolution", &format!("{}×{}", self.project.settings.width, self.project.settings.height));
                info_row(ui, "FPS", &self.project.settings.fps.to_string());
                let enc = if !self.ffmpeg_ok {
                    "FFmpeg indisponible".to_owned()
                } else if self.project.settings.encoder == Encoder::Auto {
                    format!("Auto · {}", self.detected_encoder.label())
                } else {
                    self.project.settings.encoder.label().to_owned()
                };
                info_row(ui, "Encodeur", &enc);
                info_row(ui, "Débit", &format!("{} kb/s", self.project.settings.bitrate_kbps));

                ui.add_space(28.0);
                section_title(ui, "STATUT");
                ui.add_space(8.0);
                ui.label(&self.status);
                ui.add_space(12.0);
                ui.horizontal(|ui| {
                    ui.colored_label(
                        if self.ffmpeg_ok { Color32::from_rgb(87, 221, 153) } else { Color32::from_rgb(255, 114, 114) },
                        "●",
                    );
                    ui.label(if self.ffmpeg_ok { "FFmpeg détecté" } else { "FFmpeg introuvable" });
                });
            });
    }

    pub(crate) fn central(&mut self, root: &mut egui::Ui) {
        egui::CentralPanel::default()
            .frame(egui::Frame::new().fill(Color32::from_rgb(10, 12, 17)))
            .show(root, |ui| {
                ui.vertical_centered(|ui| {
                    ui.add_space(16.0);
                    ui.label(RichText::new("APERÇU PROGRAMME").weak().size(11.0));
                    ui.add_space(10.0);
                });

                let available = ui.available_size();
                let controls_height = 106.0;
                let preview_size = Vec2::new(available.x, (available.y - controls_height).max(250.0));
                egui::Frame::new()
                    .fill(Color32::from_rgb(4, 5, 8))
                    .stroke(Stroke::new(1.0, Color32::from_rgb(43, 48, 61)))
                    .corner_radius(CornerRadius::same(14))
                    .show(ui, |ui| {
                        ui.set_min_size(preview_size);
                        ui.centered_and_justified(|ui| {
                            if let Some(texture) = &self.preview_texture {
                                let size = fit_size(texture.size_vec2(), ui.available_size());
                                ui.image((texture.id(), size));
                            } else {
                                ui.vertical_centered(|ui| {
                                    ui.label(RichText::new("◈").size(54.0).color(Color32::from_rgb(143, 102, 255)));
                                    ui.add_space(8.0);
                                    ui.label(RichText::new("Aperçu arrêté").size(18.0));
                                    ui.label(RichText::new("Clique sur “Aperçu” pour capturer le bureau Windows.").weak());
                                });
                            }
                        });
                    });

                ui.add_space(14.0);
                egui::Frame::new()
                    .fill(Color32::from_rgb(18, 21, 29))
                    .stroke(Stroke::new(1.0, Color32::from_rgb(47, 53, 67)))
                    .corner_radius(CornerRadius::same(14))
                    .inner_margin(egui::Margin::symmetric(18, 14))
                    .show(ui, |ui| {
                        ui.horizontal_centered(|ui| {
                            let record_label = if self.record_process.is_some() { "■ Arrêter REC" } else { "● Enregistrer" };
                            if ui.add_sized([150.0, 44.0], egui::Button::new(record_label)).clicked() {
                                self.toggle_recording();
                            }

                            ui.add_space(14.0);
                            let live_label = if self.stream_process.is_some() { "■ Couper le direct" } else { "▶ Lancer le direct" };
                            let live_button = egui::Button::new(RichText::new(live_label).strong())
                                .fill(if self.stream_process.is_some() {
                                    Color32::from_rgb(130, 36, 48)
                                } else {
                                    Color32::from_rgb(101, 59, 196)
                                });
                            if ui.add_sized([190.0, 44.0], live_button).clicked() {
                                self.toggle_stream();
                            }
                        });
                    });
            });
    }
}
