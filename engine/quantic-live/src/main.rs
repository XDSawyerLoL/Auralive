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
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("Aura Live — Native Broadcast")
            .with_inner_size([1440.0, 900.0])
            .with_min_inner_size([1120.0, 680.0]),
        ..Default::default()
    };

    eframe::run_native(
        "Aura Live — Native Broadcast",
        options,
        Box::new(|cc| Ok(Box::new(QuanticLiveApp::new(cc)))),
    )
}
