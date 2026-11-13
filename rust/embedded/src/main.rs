//! OGRE with a browser built into its window.
//!
//! The usual OGRE drives a Chrome of its own. This build links Chromium
//! (through CEF and the `egui_webview` crate) and hands the window a page of
//! it, which the teacher can choose to work in instead: Settings, "Where the
//! page is shown". Everything else is the same program.

use eframe::egui;
use ogre_app::OgreApp;
use ogre_embedded::Chromium;

/// OGRE's window, with the one thing a built-in page adds: it is told
/// after every frame where it is.
struct Embedded(OgreApp);

impl eframe::App for Embedded {
    fn ui(&mut self, ui: &mut egui::Ui, frame: &mut eframe::Frame) {
        self.0.ui(ui, frame);
    }

    fn save(&mut self, storage: &mut dyn eframe::Storage) {
        self.0.save(storage);
    }

    fn output_hook(&mut self, ctx: &egui::Context, output: &mut egui::FullOutput) {
        self.0.after_frame(ctx, output);
    }
}

fn main() -> eframe::Result {
    // Chromium runs its helper processes from this same program.
    if let Some(code) = egui_webview::run_cef_subprocess() {
        std::process::exit(code);
    }
    // The teacher's sign-in is kept from one run to the next, apart from
    // the profile of the Chrome the usual OGRE drives.
    if let Some(data_dir) = ogre_app::data_dir() {
        egui_webview::set_cef_cache_dir(data_dir.join("built-in-browser"));
    }
    eframe::run_native(
        "OGRE",
        ogre_app::native_options(),
        Box::new(|cc| {
            let chromium = Chromium::new(&cc.egui_ctx);
            let app = ogre_app::start(cc)?.with_built_in_browser(Box::new(chromium));
            Ok(Box::new(Embedded(app)))
        }),
    )
}
