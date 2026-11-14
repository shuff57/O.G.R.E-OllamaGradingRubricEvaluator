//! Chromium as OGRE's built-in browser, through CEF and the `egui_webview`
//! crate.

use eframe::egui;
use egui_webview::{WebViewEvent, WebViewInstance, WebViewSource};
use ogre_app::{BuiltInBrowser, PageNews};
use ogre_harness::cdp::{DialogKind, PageDialog};

/// The page of Chromium that OGRE's window shows. Made when it is first
/// wanted: a teacher who works in Chrome never starts it.
pub struct Chromium {
    ctx: egui::Context,
    page: Option<WebViewInstance>,
    /// Why the page could not be made, said once.
    failed: Option<String>,
    news: Vec<PageNews>,
    /// The text a `prompt` the page is showing suggests, which is what it
    /// is answered with.
    suggested: Option<String>,
}

impl Chromium {
    /// A page that is made when it is first shown or used.
    pub fn new(ctx: &egui::Context) -> Self {
        Self {
            ctx: ctx.clone(),
            page: None,
            failed: None,
            news: Vec::new(),
            suggested: None,
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
        for event in events {
            let news = match event {
                WebViewEvent::Loading { url } => PageNews::Loading(url),
                WebViewEvent::Loaded { url } => PageNews::Loaded(url),
                WebViewEvent::DevTools(message) => PageNews::DevTools(message),
                WebViewEvent::Asks {
                    kind,
                    message,
                    default_text,
                } => {
                    let kind = match kind {
                        egui_webview::DialogKind::Alert => DialogKind::Alert,
                        egui_webview::DialogKind::Confirm => DialogKind::Confirm,
                        egui_webview::DialogKind::Prompt => DialogKind::Prompt,
                        egui_webview::DialogKind::Leave => DialogKind::Leave,
                    };
                    self.suggested = (kind == DialogKind::Prompt).then_some(default_text);
                    PageNews::Asks(PageDialog { kind, message })
                }
                WebViewEvent::AsksNoMore => {
                    self.suggested = None;
                    PageNews::AsksNoMore
                }
                WebViewEvent::AsksForFiles { many, title } => {
                    PageNews::AsksForFiles { many, title }
                }
                // OGRE's pages are not given a way to post messages.
                _ => continue,
            };
            self.news.push(news);
        }
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

    fn answer(&mut self, accept: bool) {
        let text = self.suggested.take();
        if let Some(page) = &mut self.page {
            page.answer_dialog(accept, text.as_deref());
        }
    }

    fn give_files(&mut self, files: &[String]) {
        if let Some(page) = &mut self.page {
            page.answer_files(files);
        }
    }

    fn send_devtools(&mut self, message: &[u8]) -> Result<(), String> {
        self.page()?
            .send_devtools_message(message)
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
