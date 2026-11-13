//! Starting OGRE's window, for the programs that are OGRE: the usual one,
//! and a build that adds a browser of its own.

use ogre_harness::cdp::LaunchOptions;
use ogre_harness::sites::Sites;

use crate::{Keyring, OgreApp, STORAGE_KEY, Settings, Worker, old_app_settings_file};

/// The name OGRE's window and data folder go by.
pub const APP_ID: &str = "ogre";
const ICON: &[u8] = include_bytes!("../assets/icon-128.png");

/// How OGRE's window is set up.
pub fn native_options() -> eframe::NativeOptions {
    let mut viewport = eframe::egui::ViewportBuilder::default()
        .with_app_id(APP_ID)
        .with_inner_size([1200.0, 760.0])
        .with_min_inner_size([720.0, 420.0]);
    // Where the desktop takes a window's icon from the window itself. Others
    // take it from the menu entry named after the app id.
    if let Ok(icon) = eframe::icon_data::from_png_bytes(ICON) {
        viewport = viewport.with_icon(icon);
    }
    eframe::NativeOptions {
        viewport,
        ..Default::default()
    }
}

/// The folder OGRE keeps its data in.
pub fn data_dir() -> Option<std::path::PathBuf> {
    eframe::storage_dir(APP_ID)
}

/// OGRE as the window is created: its worker started, its settings read.
pub fn start(
    cc: &eframe::CreationContext<'_>,
) -> Result<OgreApp, Box<dyn std::error::Error + Send + Sync>> {
    let data_dir = data_dir().ok_or("could not find a folder to keep OGRE's data in")?;
    let chrome = LaunchOptions {
        profile_dir: data_dir.join("chrome-profile"),
        headless: false,
        executable: None,
    };
    let ctx = cc.egui_ctx.clone();
    let worker = Worker::spawn(chrome, Sites::built_in(), data_dir, move || {
        ctx.request_repaint();
    });
    let settings: Settings = cc
        .storage
        .and_then(|storage| eframe::get_value(storage, STORAGE_KEY))
        .unwrap_or_default();
    Ok(
        OgreApp::new(&cc.egui_ctx, worker, settings, Box::new(Keyring))
            .with_old_app_settings(old_app_settings_file()),
    )
}
