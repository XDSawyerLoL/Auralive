use eframe::egui::{self, RichText};

use crate::{
    app::QuanticLiveApp,
    model::{Encoder, SourceKind},
    ui_helpers::source_icon,
};

impl QuanticLiveApp {
    pub(crate) fn settings_window(&mut self, ctx: &egui::Context) {
        if !self.settings_open {
            return;
        }
        let mut open = self.settings_open;
        egui::Window::new("Réglages Aura Native Broadcast")
            .open(&mut open)
            .resizable(true)
            .default_width(560.0)
            .show(ctx, |ui| {
                ui.heading("Sortie vidéo");
                ui.horizontal(|ui| {
                    ui.label("Résolution");
                    ui.add(egui::DragValue::new(&mut self.project.settings.width).range(640..=3840));
                    ui.label("×");
                    ui.add(egui::DragValue::new(&mut self.project.settings.height).range(360..=2160));
                });
                ui.horizontal(|ui| {
                    ui.label("FPS");
                    ui.add(egui::Slider::new(&mut self.project.settings.fps, 24..=120));
                });
                ui.horizontal(|ui| {
                    ui.label("Débit vidéo");
                    ui.add(egui::Slider::new(&mut self.project.settings.bitrate_kbps, 1000..=50000).suffix(" kb/s"));
                });
                egui::ComboBox::from_label("Encodeur")
                    .selected_text(self.project.settings.encoder.label())
                    .show_ui(ui, |ui| {
                        for encoder in [
                            Encoder::Auto,
                            Encoder::NvencH264,
                            Encoder::AmfH264,
                            Encoder::QuickSyncH264,
                            Encoder::X264,
                        ] {
                            ui.selectable_value(&mut self.project.settings.encoder, encoder, encoder.label());
                        }
                    });

                ui.separator();
                ui.heading("Direct RTMP");
                ui.label("Serveur");
                ui.text_edit_singleline(&mut self.project.settings.rtmp_url);
                ui.label("Clé de stream");
                ui.add(egui::TextEdit::singleline(&mut self.project.settings.stream_key).password(true));

                ui.separator();
                ui.heading("Audio");
                ui.label("Nom exact du périphérique DirectShow (vide = piste silencieuse)");
                ui.text_edit_singleline(&mut self.project.settings.audio_device);

                ui.separator();
                ui.heading("Système");
                ui.label("Chemin FFmpeg");
                ui.text_edit_singleline(&mut self.project.settings.ffmpeg_path);
                ui.label("Dossier d’enregistrement");
                ui.text_edit_singleline(&mut self.project.settings.recording_dir);

                ui.add_space(12.0);
                if ui.button("Sauvegarder").clicked() {
                    self.save();
                }
            });
        self.settings_open = open;
    }

    pub(crate) fn add_source_window(&mut self, ctx: &egui::Context) {
        if !self.add_source_open {
            return;
        }
        let mut open = self.add_source_open;
        egui::Window::new("Ajouter une source")
            .open(&mut open)
            .collapsible(false)
            .resizable(false)
            .show(ctx, |ui| {
                ui.label("Choisis le type de source à préparer dans la scène.");
                ui.add_space(8.0);
                for kind in [
                    SourceKind::Desktop,
                    SourceKind::Window,
                    SourceKind::Game,
                    SourceKind::Webcam,
                    SourceKind::Image,
                    SourceKind::Text,
                    SourceKind::Browser,
                ] {
                    if ui
                        .add_sized(
                            [260.0, 34.0],
                            egui::Button::new(format!("{}  {}", source_icon(&kind), kind.label())),
                        )
                        .clicked()
                    {
                        self.add_source(kind);
                    }
                }
                ui.add_space(6.0);
                ui.label(
                    RichText::new(
                        "V0.1 encode réellement la capture Écran. Les autres sources sont déjà modélisées pour le moteur de composition V0.2.",
                    )
                    .weak()
                    .size(11.0),
                );
            });
        self.add_source_open = open;
    }
}
