//! The Browser screen: the page Chrome is on, drawn in OGRE's window, with
//! the teacher's mouse and keyboard passed on to it.

use eframe::egui::{self, Align, Frame, Layout};
use ogre_harness::cdp::{Held, MouseAction, MouseButton, ViewSize};

use super::{Action, CONTENT_MARGIN, OgreApp};
use crate::kit;
use crate::tab_view::{ViewInput, ViewLink};
use crate::theme::{icon, pal, ty};

/// The Browser screen's state: the page as last drawn, and where the mouse
/// stands with it.
#[derive(Default)]
pub(super) struct BrowserView {
    /// The newest picture of the page.
    picture: Option<egui::TextureHandle>,
    /// The size the page was last asked to be drawn at.
    size: Option<ViewSize>,
    /// The address the page was last known to be at, to notice it moving.
    address: String,
    /// The mouse button that went down on the page and is still down, with
    /// its place in a run of clicks.
    down: Option<(MouseButton, u32)>,
    /// When and where the last press was, to tell a double click.
    last_press: Option<(f64, egui::Pos2, u32)>,
}

/// Two presses this close in time and place are a double click.
const DOUBLE_CLICK_SECONDS: f64 = 0.4;
const DOUBLE_CLICK_DISTANCE: f32 = 5.0;
/// How far one notch of a mouse wheel scrolls, in the page's own pixels.
const WHEEL_LINE: f32 = 40.0;

impl OgreApp {
    pub(super) fn browser_screen(&mut self, ui: &mut egui::Ui, actions: &mut Vec<Action>) {
        let idle = self.busy.is_none();
        egui::CentralPanel::default()
            .frame(Frame::new().inner_margin(CONTENT_MARGIN))
            .show(ui, |ui| {
                if !self.chrome_running {
                    kit::page_header(
                        ui,
                        "OGRE  /  Browser",
                        "Browser",
                        Some(
                            "The page Chrome is on, shown here instead of in a window of its own.",
                        ),
                    );
                    self.browser_card(ui, actions);
                    return;
                }
                // The address box follows the page, except while it is typed in.
                let built_in = self.uses_built_in();
                let at = match &self.built_in {
                    Some(browser) if built_in => browser.address.clone(),
                    _ => self.worker.view().state().address.clone(),
                };
                if at != self.browser.address {
                    self.browser.address.clone_from(&at);
                    self.address = at;
                }
                kit::wide_card(ui, |ui| {
                    ui.horizontal(|ui| {
                        let back = kit::icon_button(ui, icon::BACK, "Back", true).clicked();
                        let forward =
                            kit::icon_button(ui, icon::FORWARD, "Forward", true).clicked();
                        let reload =
                            kit::icon_button(ui, icon::RELOAD, "Reload the page", true).clicked();
                        match self.built_in.as_mut().filter(|_| built_in) {
                            Some(browser) => {
                                let browser = browser.browser();
                                if back {
                                    browser.back();
                                }
                                if forward {
                                    browser.forward();
                                }
                                if reload {
                                    browser.reload();
                                }
                            }
                            None => {
                                let view = self.worker.view();
                                for (pressed, input) in [
                                    (back, ViewInput::Back),
                                    (forward, ViewInput::Forward),
                                    (reload, ViewInput::Reload),
                                ] {
                                    if pressed {
                                        view.send(input);
                                    }
                                }
                            }
                        }
                        let stop_label = if built_in {
                            "Stop the browser"
                        } else {
                            "Stop Chrome"
                        };
                        let stop = ui
                            .with_layout(Layout::right_to_left(Align::Center), |ui| {
                                let stop = kit::ghost(ui, stop_label, idle);
                                let go = kit::ghost(ui, "Go", idle);
                                let address = ui.add(
                                    egui::TextEdit::singleline(&mut self.address)
                                        .hint_text("Address")
                                        .desired_width(f32::INFINITY),
                                );
                                let entered = address.lost_focus()
                                    && ui.input(|i| i.key_pressed(egui::Key::Enter));
                                let address = self.address.trim();
                                if idle && !address.is_empty() && (go.clicked() || entered) {
                                    actions.push(Action::Open(address.to_owned()));
                                }
                                stop.clicked()
                            })
                            .inner;
                        if stop {
                            actions.push(Action::StopChrome);
                        }
                    });
                    self.messages(ui, actions);
                });
                ui.add_space(4.0);
                match self.built_in.as_mut().filter(|_| built_in) {
                    Some(browser) => {
                        let size = ui.available_size();
                        browser.browser().show(ui, size);
                    }
                    None => self.browser.page(ui, self.worker.view()),
                }
            });
    }
}

impl BrowserView {
    /// The page itself: its picture, and the teacher's mouse and keyboard
    /// passed on to it.
    fn page(&mut self, ui: &mut egui::Ui, view: &ViewLink) {
        let rect = ui.available_rect_before_wrap();
        let response = ui.allocate_rect(rect, egui::Sense::click_and_drag());
        response.widget_info(|| {
            egui::WidgetInfo::labeled(egui::Role::Canvas, true, "The page in Chrome")
        });
        ui.painter().rect_filled(rect, 0, pal().card);

        let size = ViewSize {
            width: rect.width().round().max(1.0) as u32,
            height: rect.height().round().max(1.0) as u32,
            scale: f64::from(ui.ctx().pixels_per_point()),
        };
        if self.size != Some(size) {
            self.size = Some(size);
            view.send(ViewInput::Size(size));
        }

        let (picture, showing, copied) = {
            let mut state = view.state();
            state.watched = true;
            (state.picture.take(), state.showing, state.copied.take())
        };
        if let Some(copied) = copied {
            ui.ctx().copy_text(copied);
        }
        if let Some(image) = picture {
            let options = egui::TextureOptions::LINEAR;
            match &mut self.picture {
                Some(texture) => texture.set(image, options),
                None => {
                    self.picture = Some(ui.ctx().load_texture("page", image, options));
                }
            }
        }
        if !showing {
            self.picture = None;
        }
        match &self.picture {
            Some(texture) => {
                let whole = egui::Rect::from_min_max(egui::pos2(0.0, 0.0), egui::pos2(1.0, 1.0));
                ui.painter()
                    .image(texture.id(), rect, whole, egui::Color32::WHITE);
            }
            None => {
                ui.painter().text(
                    rect.center(),
                    egui::Align2::CENTER_CENTER,
                    "Waiting for Chrome to draw the page\u{2026}",
                    egui::FontId::proportional(ty::BODY),
                    pal().muted,
                );
            }
        }
        ui.painter().rect_stroke(
            rect,
            0,
            egui::Stroke::new(1.0, pal().border),
            egui::StrokeKind::Inside,
        );
        if response.has_focus() {
            // Tab, the arrows and Escape belong to the page while it is typed in.
            let keys = egui::EventFilter {
                tab: true,
                horizontal_arrows: true,
                vertical_arrows: true,
                escape: true,
            };
            ui.memory_mut(|memory| memory.set_focus_lock_filter(response.id, keys));
        }

        self.pass_on(ui, view, rect, &response);
    }

    /// Passes what the teacher did with the mouse and keyboard this frame on
    /// to the page.
    fn pass_on(
        &mut self,
        ui: &egui::Ui,
        view: &ViewLink,
        rect: egui::Rect,
        response: &egui::Response,
    ) {
        let (events, now, pointer) =
            ui.input(|i| (i.events.clone(), i.time, i.pointer.latest_pos()));
        let mouse = |action: MouseAction, pos: egui::Pos2, held: Held| {
            view.send(ViewInput::Mouse {
                action,
                x: f64::from(pos.x - rect.min.x),
                y: f64::from(pos.y - rect.min.y),
                held,
            });
        };
        let held = |m: egui::Modifiers| Held {
            alt: m.alt,
            ctrl: m.ctrl,
            meta: m.mac_cmd,
            shift: m.shift,
        };
        for event in events {
            match event {
                egui::Event::PointerMoved(pos)
                    if self.down.is_some() || response.contains_pointer() =>
                {
                    let action = MouseAction::Move {
                        held: matches!(self.down, Some((MouseButton::Left, _))),
                    };
                    mouse(action, pos, Held::default());
                }
                egui::Event::PointerButton {
                    pos,
                    button,
                    pressed,
                    modifiers,
                } => {
                    let button = match button {
                        egui::PointerButton::Primary => MouseButton::Left,
                        egui::PointerButton::Secondary => MouseButton::Right,
                        egui::PointerButton::Middle => MouseButton::Middle,
                        _ => continue,
                    };
                    let action = if pressed {
                        if !response.contains_pointer() {
                            continue;
                        }
                        let clicks = match self.last_press {
                            Some((when, at, clicks))
                                if now - when <= DOUBLE_CLICK_SECONDS
                                    && at.distance(pos) <= DOUBLE_CLICK_DISTANCE =>
                            {
                                clicks + 1
                            }
                            _ => 1,
                        };
                        self.last_press = Some((now, pos, clicks));
                        self.down = Some((button, clicks));
                        response.request_focus();
                        MouseAction::Press { button, clicks }
                    } else {
                        // Only a button that went down on the page comes up on it.
                        let Some((_, clicks)) = self.down.filter(|(down, _)| *down == button)
                        else {
                            continue;
                        };
                        self.down = None;
                        MouseAction::Release { button, clicks }
                    };
                    mouse(action, pos, held(modifiers));
                }
                egui::Event::MouseWheel {
                    unit,
                    delta,
                    modifiers,
                    ..
                } if response.contains_pointer() => {
                    let step = match unit {
                        egui::MouseWheelUnit::Point => 1.0,
                        egui::MouseWheelUnit::Line => WHEEL_LINE,
                        egui::MouseWheelUnit::Page => rect.height(),
                    };
                    // The wheel says which way the content moves; the page is
                    // told which way to scroll.
                    let action = MouseAction::Wheel {
                        dx: f64::from(-delta.x * step),
                        dy: f64::from(-delta.y * step),
                    };
                    mouse(action, pointer.unwrap_or(rect.center()), held(modifiers));
                }
                _ if !response.has_focus() => {}
                egui::Event::Text(text) => {
                    let mut characters = text.chars();
                    match (characters.next(), characters.next()) {
                        // One character is a key, so that the page sees it
                        // being pressed, as pages that watch the keyboard need.
                        (Some(_), None) => {
                            for pressed in [true, false] {
                                view.send(ViewInput::Key {
                                    name: text.clone(),
                                    pressed,
                                    held: Held::default(),
                                });
                            }
                        }
                        (None, _) => {}
                        _ => view.send(ViewInput::Text(text)),
                    }
                }
                egui::Event::Key {
                    key,
                    pressed,
                    modifiers,
                    ..
                } => {
                    if let Some(name) = key_name(key, modifiers) {
                        view.send(ViewInput::Key {
                            name,
                            pressed,
                            held: held(modifiers),
                        });
                    }
                }
                egui::Event::Copy => view.send(ViewInput::Copy),
                egui::Event::Cut => view.send(ViewInput::Cut),
                egui::Event::Paste(text) => view.send(ViewInput::Text(text)),
                _ => {}
            }
        }
    }
}

/// The DOM name of a key the page is to be told about as a key: one that
/// types nothing, or any key pressed as a shortcut. A key that types comes
/// as text instead, already what the keyboard layout makes of it.
fn key_name(key: egui::Key, modifiers: egui::Modifiers) -> Option<String> {
    use egui::Key;
    let named = match key {
        Key::ArrowDown => "ArrowDown",
        Key::ArrowLeft => "ArrowLeft",
        Key::ArrowRight => "ArrowRight",
        Key::ArrowUp => "ArrowUp",
        Key::Escape => "Escape",
        Key::Tab => "Tab",
        Key::Backspace => "Backspace",
        Key::Enter => "Enter",
        Key::Insert => "Insert",
        Key::Delete => "Delete",
        Key::Home => "Home",
        Key::End => "End",
        Key::PageUp => "PageUp",
        Key::PageDown => "PageDown",
        _ => "",
    };
    if !named.is_empty() {
        return Some(named.to_owned());
    }
    let name = key.name();
    if name.len() > 1 && name.starts_with('F') && name[1..].parse::<u8>().is_ok() {
        return Some(name.to_owned());
    }
    // Copy, cut and paste arrive as events of their own.
    let shortcut = (modifiers.ctrl || modifiers.mac_cmd) && !modifiers.alt;
    let clipboard = matches!(key, Key::C | Key::X | Key::V);
    (shortcut && !clipboard && name.len() == 1).then(|| name.to_lowercase())
}
