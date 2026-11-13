fn main() -> eframe::Result {
    eframe::run_native(
        "OGRE",
        ogre_app::native_options(),
        Box::new(|cc| Ok(Box::new(ogre_app::start(cc)?))),
    )
}
