//! OGRE with a browser built into its window.
//!
//! The usual OGRE drives a Chrome of its own. This build links Chromium
//! (through CEF and the `egui_webview` crate) and hands the window a page of
//! it, which the teacher can choose to work in instead: Settings, "Where the
//! page is shown". Everything else is the same program.

use std::path::PathBuf;
use std::time::{Duration, Instant};

use eframe::egui;
use ogre_app::OgreApp;
use ogre_embedded::Chromium;

/// OGRE's window, with the one thing a built-in page adds: it is told
/// after every frame where it is.
struct Embedded {
    app: OgreApp,
    shot: Option<Shot>,
}

/// A picture of OGRE's own window to save, for checking this build without
/// a tool that takes pictures of the screen: `OGRE_SHOT=<file.png>`, taken
/// `OGRE_SHOT_AFTER` seconds after the start (10 if not said). OGRE ends
/// once the picture is saved.
struct Shot {
    file: PathBuf,
    at: Instant,
    asked: bool,
}

impl Shot {
    fn from_env() -> Option<Self> {
        let file = std::env::var_os("OGRE_SHOT").filter(|file| !file.is_empty())?;
        let after = std::env::var("OGRE_SHOT_AFTER")
            .ok()
            .and_then(|seconds| seconds.parse().ok())
            .unwrap_or(10.0);
        Some(Self {
            file: file.into(),
            at: Instant::now() + Duration::from_secs_f64(after),
            asked: false,
        })
    }

    /// Asks for the picture when it is time. It is saved when it arrives,
    /// and OGRE ends there.
    fn step(&mut self, ctx: &egui::Context) {
        if !self.asked && Instant::now() >= self.at {
            self.asked = true;
            let file = self.file.clone();
            let save = egui::ScreenshotCallback::new(move |picture| {
                let [width, height] = picture.resolution();
                let saved = image::RgbaImage::from_raw(
                    u32::try_from(width).unwrap_or(0),
                    u32::try_from(height).unwrap_or(0),
                    picture.as_raw().to_vec(),
                )
                .ok_or_else(|| "the picture has no pixels".to_owned())
                .and_then(|pixels| pixels.save(&file).map_err(|error| error.to_string()));
                match saved {
                    Ok(()) => std::process::exit(0),
                    Err(problem) => {
                        eprintln!("The picture could not be saved: {problem}");
                        std::process::exit(1);
                    }
                }
            });
            ctx.send_viewport_cmd(egui::ViewportCommand::Screenshot(save));
        }
        ctx.request_repaint_after(Duration::from_millis(100));
    }
}

impl eframe::App for Embedded {
    fn ui(&mut self, ui: &mut egui::Ui, frame: &mut eframe::Frame) {
        self.app.ui(ui, frame);
        if let Some(shot) = &mut self.shot {
            shot.step(ui.ctx());
        }
    }

    fn save(&mut self, storage: &mut dyn eframe::Storage) {
        self.app.save(storage);
    }

    fn output_hook(&mut self, ctx: &egui::Context, output: &mut egui::FullOutput) {
        self.app.after_frame(ctx, output);
    }
}

/// Where the built-in browser starts, when OGRE was not started to show a
/// page of its own.
const HOME: &str = "https://duckduckgo.com/";

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
            let mut app = ogre_app::start(cc)?.with_built_in_browser(Box::new(chromium));
            // OGRE_OPEN=<address> starts straight into the built-in browser
            // at that page, to show it or to try it.
            // Otherwise it starts in the built-in browser at a search page,
            // unless the teacher has chosen Chrome in Settings.
            app = match std::env::var("OGRE_OPEN").ok().filter(|a| !a.is_empty()) {
                Some(address) => app.working_in_built_in_browser().opening(address),
                None => app.starting_in_built_in_browser(HOME),
            };
            Ok(Box::new(Embedded {
                app,
                shot: Shot::from_env(),
            }))
        }),
    )
}
