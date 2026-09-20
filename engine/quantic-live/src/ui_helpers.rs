use eframe::egui::{self, Color32, CornerRadius, RichText, Stroke, Vec2};

use crate::model::SourceKind;

pub(crate) fn configure_style(ctx: &egui::Context) {
    ctx.set_theme(egui::Theme::Dark);
    ctx.global_style_mut(|style| {
        style.spacing.item_spacing = Vec2::new(9.0, 9.0);
        style.spacing.button_padding = Vec2::new(12.0, 7.0);
    });
}

pub(crate) fn panel_frame() -> egui::Frame {
    egui::Frame::new()
        .fill(Color32::from_rgb(15, 18, 25))
        .inner_margin(egui::Margin::same(14))
        .stroke(Stroke::new(1.0, Color32::from_rgb(38, 43, 55)))
}

pub(crate) fn section_title(ui: &mut egui::Ui, text: &str) {
    ui.label(RichText::new(text).strong().size(11.0).color(Color32::from_rgb(157, 164, 181)));
}

pub(crate) fn badge(ui: &mut egui::Ui, text: &str) {
    egui::Frame::new()
        .fill(Color32::from_rgb(37, 28, 62))
        .corner_radius(CornerRadius::same(7))
        .inner_margin(egui::Margin::symmetric(8, 4))
        .show(ui, |ui| {
            ui.label(RichText::new(text).size(10.0).color(Color32::from_rgb(205, 185, 255)));
        });
}

pub(crate) fn audio_strip(ui: &mut egui::Ui, label: &str, volume: &mut f32, muted: &mut bool) {
    ui.horizontal(|ui| {
        ui.label(RichText::new(label).strong());
        if ui.small_button(if *muted { "Muet" } else { "Actif" }).clicked() {
            *muted = !*muted;
        }
    });
    ui.add(egui::Slider::new(volume, 0.0..=1.0).show_value(false));
    let level = if *muted { 0.0 } else { *volume };
    let bar_width = ui.available_width() * level;
    let (rect, _) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 5.0), egui::Sense::hover());
    ui.painter().rect_filled(rect, CornerRadius::same(2), Color32::from_rgb(36, 41, 52));
    let active = egui::Rect::from_min_size(rect.min, Vec2::new(bar_width, rect.height()));
    ui.painter().rect_filled(active, CornerRadius::same(2), Color32::from_rgb(118, 83, 224));
}

pub(crate) fn info_row(ui: &mut egui::Ui, left: &str, right: &str) {
    ui.horizontal(|ui| {
        ui.label(RichText::new(left).weak());
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            ui.label(right);
        });
    });
}

pub(crate) fn source_icon(kind: &SourceKind) -> &'static str {
    match kind {
        SourceKind::Desktop => "▣",
        SourceKind::Window => "▤",
        SourceKind::Game => "◆",
        SourceKind::Webcam => "◉",
        SourceKind::Image => "▧",
        SourceKind::Text => "T",
        SourceKind::Browser => "◎",
    }
}

pub(crate) fn fit_size(source: Vec2, target: Vec2) -> Vec2 {
    if source.x <= 0.0 || source.y <= 0.0 {
        return target;
    }
    let scale = (target.x / source.x).min(target.y / source.y);
    source * scale
}
