use ogre_app::{Keyring, OgreApp, STORAGE_KEY, Settings, Worker};
use ogre_harness::cdp::LaunchOptions;
use ogre_harness::sites::Sites;

const APP_ID: &str = "ogre";

fn main() -> eframe::Result {
    let options = eframe::NativeOptions {
        viewport: eframe::egui::ViewportBuilder::default()
            .with_app_id(APP_ID)
            .with_inner_size([1200.0, 760.0])
            .with_min_inner_size([720.0, 420.0]),
        ..Default::default()
    };
    eframe::run_native(
        "OGRE",
        options,
        Box::new(|cc| {
            let data_dir = eframe::storage_dir(APP_ID)
                .ok_or("could not find a folder to keep OGRE's data in")?;
            let chrome = LaunchOptions {
                profile_dir: data_dir.join("chrome-profile"),
                headless: false,
                executable: None,
            };
            let ctx = cc.egui_ctx.clone();
            let worker = Worker::spawn(chrome, Sites::built_in(), data_dir, move || {
                ctx.request_repaint()
            });
            let settings: Settings = cc
                .storage
                .and_then(|storage| eframe::get_value(storage, STORAGE_KEY))
                .unwrap_or_default();
            Ok(Box::new(OgreApp::new(
                &cc.egui_ctx,
                worker,
                settings,
                Box::new(Keyring),
            )))
        }),
    )
}
