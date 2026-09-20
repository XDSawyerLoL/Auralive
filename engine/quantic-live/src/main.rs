#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod control;
mod ffmpeg;
mod model;
mod ui_helpers;
mod ui_panels;
mod ui_windows;

use eframe::egui;

use crate::app::QuanticLiveApp;

fn main() -> eframe::Result<()> {
    let headless = std::env::var("AURA_NATIVE_HEADLESS")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let mut viewport = egui::ViewportBuilder::default()
        .with_title("Aura Live — Native Broadcast")
        .with_inner_size([1440.0, 900.0])
        .with_min_inner_size([1120.0, 680.0]);
    if headless {
        viewport = viewport.with_visible(false);
    }

    let options = eframe::NativeOptions {
        viewport,
        ..Default::default()
    };

    eframe::run_native(
        "Aura Live — Native Broadcast",
        options,
        Box::new(|cc| Ok(Box::new(QuanticLiveApp::new(cc)))),
    )
}
