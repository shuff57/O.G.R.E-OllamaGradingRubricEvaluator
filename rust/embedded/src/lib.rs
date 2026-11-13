//! Chromium as OGRE's built-in browser, through CEF and the `egui_webview`
//! crate.

use eframe::egui;
use egui_webview::{WebViewEvent, WebViewInstance, WebViewSource};
use ogre_app::{BuiltInBrowser, PageNews};

/// The page of Chromium that OGRE's window shows. Made when it is first
/// wanted: a teacher who works in Chrome never starts it.
pub struct Chromium {
    ctx: egui::Context,
    page: Option<WebViewInstance>,
    /// Why the page could not be made, said once.
    failed: Option<String>,
    news: Vec<PageNews>,
}

impl Chromium {
    /// A page that is made when it is first shown or used.
    pub fn new(ctx: &egui::Context) -> Self {
        Self {
            ctx: ctx.clone(),
            page: None,
            failed: None,
            news: Vec::new(),
        }
    }

    fn page(&mut self) -> Result<&mut WebViewInstance, String> {
        if self.page.is_none() {
            if let Some(problem) = &self.failed {
                return Err(problem.clone());
            }
            let start = WebViewSource::Url("about:blank".to_owned());
            match WebViewInstance::new_cef(
                &self.ctx,
                egui::Id::unique("ogre-built-in-page"),
                &start,
            ) {
                Ok(page) => self.page = Some(page),
                Err(error) => {
                    let problem = format!("The built-in browser could not start: {error}");
                    self.failed = Some(problem.clone());
                    return Err(problem);
                }
            }
        }
        self.page.as_mut().ok_or_else(|| "no page".to_owned())
    }

    fn take(&mut self, events: Vec<WebViewEvent>) {
        self.news
            .extend(events.into_iter().filter_map(|event| match event {
                WebViewEvent::Loading { url } => Some(PageNews::Loading(url)),
                WebViewEvent::Loaded { url } => Some(PageNews::Loaded(url)),
                WebViewEvent::Message(text) => Some(PageNews::Message(text)),
                _ => None,
            }));
    }
}

impl BuiltInBrowser for Chromium {
    fn show(&mut self, ui: &mut egui::Ui, size: egui::Vec2) {
        match self.page() {
            Ok(page) => {
                let events = page.ui(ui, size).events;
                self.take(events);
            }
            Err(problem) => {
                ui.label(problem);
            }
        }
    }

    fn news(&mut self) -> Vec<PageNews> {
        if let Some(page) = &mut self.page {
            let events = page.take_events();
            self.take(events);
        }
        std::mem::take(&mut self.news)
    }

    fn load(&mut self, url: &str) -> Result<(), String> {
        self.page()?
            .load_url(url)
            .map_err(|error| error.to_string())
    }

    fn run_script(&mut self, script: &str) -> Result<(), String> {
        self.page()?
            .evaluate_script(script)
            .map_err(|error| error.to_string())
    }

    fn back(&mut self) {
        if let Some(page) = &mut self.page {
            page.back();
        }
    }

    fn forward(&mut self) {
        if let Some(page) = &mut self.page {
            page.forward();
        }
    }

    fn reload(&mut self) {
        if let Some(page) = &mut self.page {
            page.reload();
        }
    }

    fn after_frame(&mut self, ctx: &egui::Context, output: &egui::FullOutput) {
        if let Some(page) = &mut self.page {
            page.place(ctx, &output.platform_output.embedded_views);
        }
    }
}
