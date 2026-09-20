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
    // Quantic Studio owns the visible interface. The native engine is a
    // background core by default and only exposes its diagnostic UI when
    // explicitly requested by a developer.
    let diagnostic_ui = std::env::var("QUANTIC_STUDIO_CORE_UI")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let forced_headless = std::env::var("AURA_NATIVE_HEADLESS")
        .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let headless = forced_headless || !diagnostic_ui;
    let mut viewport = egui::ViewportBuilder::default()
        .with_title("Quantic Studio Core")
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
        "Quantic Studio Core",
        options,
        Box::new(|cc| Ok(Box::new(QuanticLiveApp::new(cc)))),
    )
}
