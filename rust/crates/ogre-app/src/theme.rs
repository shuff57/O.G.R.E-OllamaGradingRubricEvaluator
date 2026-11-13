//! House theme, shared with verSHion: "Study Studio in paper tones".
//!
//! Cream and brown neutrals, one chalkboard-green accent, and a highlighter
//! yellow used only as a marker. Never pure white or black. Source Serif for
//! titles, Source Sans for everything else, line icons only.
//!
//! Screens take every colour from here; none keeps its own hex values.

use std::cell::Cell;
use std::sync::Arc;

use eframe::egui::{
    self, Color32, Context, CornerRadius, FontData, FontDefinitions, FontFamily, FontId, RichText,
    Stroke, TextStyle, ThemePreference,
};

#[derive(Clone, Copy)]
pub struct Palette {
    /// Desk: the whole-app background, under the faint graph-paper grid.
    pub desk: Color32,
    /// The dock on the left.
    pub rail: Color32,
    /// Cards, windows, popovers.
    pub card: Color32,
    /// Inputs and inset areas.
    pub field: Color32,
    /// Hairline around cards and windows.
    pub border: Color32,
    /// Outline of a control: strong enough (3:1) to read as something to press.
    pub edge: Color32,
    /// Headings and emphasized text.
    pub ink: Color32,
    /// Body text.
    pub text: Color32,
    /// Captions and secondary text.
    pub muted: Color32,
    /// The primary button, links, active controls.
    pub accent: Color32,
    /// Soft accent wash: selected rows, calm status pills.
    pub accent_wash: Color32,
    /// Text on a filled accent button.
    pub on_accent: Color32,
    /// Marker for the thing to look at. Always carries dark ink text.
    pub highlighter: Color32,
    pub hover: Color32,
    /// Errors and destructive actions.
    pub danger: Color32,
    /// Something is missing or needs a look; calmer than `danger`.
    pub warn: Color32,
    /// The 24 px graph-paper line, alpha-blended.
    pub grid: Color32,
}

pub const LIGHT: Palette = Palette {
    desk: Color32::from_rgb(0xf7, 0xf4, 0xed),
    rail: Color32::from_rgb(0x33, 0x2a, 0x24),
    card: Color32::from_rgb(0xff, 0xfd, 0xf8),
    field: Color32::from_rgb(0xf3, 0xee, 0xe3),
    border: Color32::from_rgb(0xe0, 0xd3, 0xc2),
    edge: Color32::from_rgb(0x9c, 0x86, 0x72),
    ink: Color32::from_rgb(0x33, 0x2a, 0x24),
    text: Color32::from_rgb(0x5e, 0x4c, 0x40),
    muted: Color32::from_rgb(0x7a, 0x63, 0x50),
    accent: Color32::from_rgb(0x2f, 0x61, 0x44),
    accent_wash: Color32::from_rgb(0xdf, 0xe9, 0xd4),
    on_accent: Color32::from_rgb(0xf7, 0xfb, 0xf3),
    highlighter: Color32::from_rgb(0xf3, 0xdc, 0x6a),
    hover: Color32::from_rgb(0xef, 0xe8, 0xdb),
    danger: Color32::from_rgb(0xa3, 0x3b, 0x2e),
    warn: Color32::from_rgb(0x8a, 0x58, 0x12),
    grid: Color32::from_rgba_premultiplied(3, 2, 2, 14),
};

pub const DARK: Palette = Palette {
    desk: Color32::from_rgb(0x21, 0x1c, 0x18),
    rail: Color32::from_rgb(0x14, 0x10, 0x0d),
    card: Color32::from_rgb(0x2b, 0x25, 0x20),
    field: Color32::from_rgb(0x21, 0x1c, 0x18),
    border: Color32::from_rgb(0x4b, 0x3f, 0x35),
    edge: Color32::from_rgb(0x85, 0x72, 0x5f),
    ink: Color32::from_rgb(0xf2, 0xe8, 0xdd),
    text: Color32::from_rgb(0xd3, 0xc2, 0xb2),
    muted: Color32::from_rgb(0xa9, 0x93, 0x7e),
    accent: Color32::from_rgb(0x9d, 0xcb, 0xa0),
    accent_wash: Color32::from_rgb(0x2d, 0x3b, 0x2c),
    on_accent: Color32::from_rgb(0x0e, 0x20, 0x12),
    highlighter: Color32::from_rgb(0xe9, 0xcf, 0x55),
    hover: Color32::from_rgb(0x38, 0x30, 0x28),
    danger: Color32::from_rgb(0xe0, 0x82, 0x6e),
    warn: Color32::from_rgb(0xe0, 0xb4, 0x62),
    grid: Color32::from_rgba_premultiplied(2, 2, 2, 11),
};

/// Dark ink for text on the highlighter, in both modes.
pub const ON_HIGHLIGHTER: Color32 = Color32::from_rgb(0x33, 0x2a, 0x24);
/// Labels and icons on the dock, which is dark in both modes.
pub const DOCK_TEXT: Color32 = Color32::from_rgb(0xe9, 0xdf, 0xd2);

/// Corner radius of cards and popovers.
pub const R_CARD: u8 = 16;
/// Corner radius of fields and buttons.
pub const R_FIELD: u8 = 12;

/// The type scale. Call sites name a role instead of typing a size.
pub mod ty {
    /// Page title (serif).
    pub const TITLE: f32 = 34.0;
    /// Panel heading (serif).
    pub const PANEL: f32 = 19.0;
    /// Body prose.
    pub const BODY: f32 = 14.0;
    /// Meta lines and status words.
    pub const META: f32 = 13.0;
    /// Section labels and pills. Nothing on a screen is smaller.
    pub const LABEL: f32 = 12.0;
    /// Button text.
    pub const BUTTON: f32 = 14.0;
}

thread_local! {
    static DARK_MODE: Cell<bool> = const { Cell::new(false) };
}

pub fn is_dark() -> bool {
    DARK_MODE.with(Cell::get)
}

/// The palette in use.
pub fn pal() -> Palette {
    if is_dark() { DARK } else { LIGHT }
}

/// Registers the fonts and applies the light or dark palette.
pub fn setup(ctx: &Context, dark: bool) {
    ctx.set_fonts(fonts());
    set_dark(ctx, dark);
}

pub fn set_dark(ctx: &Context, dark: bool) {
    DARK_MODE.with(|mode| mode.set(dark));
    ctx.set_theme(if dark {
        ThemePreference::Dark
    } else {
        ThemePreference::Light
    });
    ctx.all_styles_mut(apply_style);
}

/// Phosphor line icons, as text in the icon font.
pub mod icon {
    pub const GRADE: &str = "\u{E742}";
    pub const AGENT: &str = "\u{E762}";
    pub const SITES: &str = "\u{E28E}";
    pub const HISTORY: &str = "\u{E1A0}";
    pub const SETTINGS: &str = "\u{E270}";
    pub const SUN: &str = "\u{E472}";
    pub const MOON: &str = "\u{E330}";
    pub const WARNING: &str = "\u{E4E0}";
    pub const CHECK: &str = "\u{E184}";
    pub const BROWSER: &str = "\u{E0F4}";
    pub const BACK: &str = "\u{E058}";
    pub const FORWARD: &str = "\u{E06C}";
    pub const RELOAD: &str = "\u{E036}";
    pub const RUBRICS: &str = "\u{EADC}";
}

const SERIF: &str = "ogre-serif";
const BOLD: &str = "ogre-sans-bold";
const SEMIBOLD: &str = "ogre-sans-semibold";
const ICONS: &str = "ogre-icons";

const SANS_FACE: &str = "OgreSans-Regular";
const SEMIBOLD_FACE: &str = "OgreSans-Semibold";
const BOLD_FACE: &str = "OgreSans-Bold";
const SERIF_FACE: &str = "OgreSerif-Regular";
const ICON_FACE: &str = "OgreIcons";

pub fn serif_family() -> FontFamily {
    FontFamily::Name(SERIF.into())
}

pub fn bold_family() -> FontFamily {
    FontFamily::Name(BOLD.into())
}

pub fn semibold_family() -> FontFamily {
    FontFamily::Name(SEMIBOLD.into())
}

pub fn icon_font(size: f32) -> FontId {
    FontId::new(size, FontFamily::Name(ICONS.into()))
}

fn fonts() -> FontDefinitions {
    // Subsets of Source Sans 3, Source Serif 4 and Phosphor, built by
    // assets/fonts/subset.py. Characters they lack come from egui's fonts.
    let mut defs = FontDefinitions::default();
    let faces: [(&str, &'static [u8]); 5] = [
        (
            SANS_FACE,
            include_bytes!("../assets/fonts/OgreSans-Regular.ttf"),
        ),
        (
            SEMIBOLD_FACE,
            include_bytes!("../assets/fonts/OgreSans-Semibold.ttf"),
        ),
        (
            BOLD_FACE,
            include_bytes!("../assets/fonts/OgreSans-Bold.ttf"),
        ),
        (
            SERIF_FACE,
            include_bytes!("../assets/fonts/OgreSerif-Regular.ttf"),
        ),
        (ICON_FACE, include_bytes!("../assets/fonts/OgreIcons.ttf")),
    ];
    for (name, bytes) in faces {
        defs.font_data
            .insert(name.to_owned(), Arc::new(FontData::from_static(bytes)));
    }

    let fallback = defs
        .families
        .get(&FontFamily::Proportional)
        .cloned()
        .unwrap_or_default();
    let family = |first: &[&str]| -> Vec<String> {
        first
            .iter()
            .map(|name| (*name).to_owned())
            .chain(std::iter::once(ICON_FACE.to_owned()))
            .chain(fallback.iter().cloned())
            .collect()
    };
    defs.families
        .insert(FontFamily::Proportional, family(&[SANS_FACE]));
    for (name, faces) in [
        (BOLD, &[BOLD_FACE, SANS_FACE][..]),
        (SEMIBOLD, &[SEMIBOLD_FACE, SANS_FACE][..]),
        (SERIF, &[SERIF_FACE, SANS_FACE][..]),
        (ICONS, &[][..]),
    ] {
        defs.families
            .insert(FontFamily::Name(name.into()), family(faces));
    }
    defs
}

fn apply_style(style: &mut egui::Style) {
    let p = pal();
    let field = CornerRadius::same(R_FIELD);

    let v = &mut style.visuals;
    v.dark_mode = is_dark();
    v.panel_fill = p.desk;
    v.window_fill = p.card;
    v.window_stroke = Stroke::new(1.0, p.border);
    v.window_corner_radius = CornerRadius::same(R_CARD);
    v.menu_corner_radius = field;
    v.faint_bg_color = p.field;
    v.extreme_bg_color = p.field;
    v.text_edit_bg_color = Some(p.field);
    v.code_bg_color = p.accent_wash;
    v.hyperlink_color = p.accent;
    v.warn_fg_color = p.warn;
    v.error_fg_color = p.danger;
    v.selection.bg_fill = p.accent_wash;
    v.selection.stroke = Stroke::new(0.0, p.ink);

    v.widgets.noninteractive.fg_stroke = Stroke::new(1.0, p.text);
    v.widgets.noninteractive.bg_stroke = Stroke::new(1.0, p.border);
    v.widgets.noninteractive.corner_radius = field;
    for (state, fill, outline) in [
        (&mut v.widgets.inactive, p.card, p.edge),
        (&mut v.widgets.hovered, p.hover, p.edge),
        (&mut v.widgets.active, p.accent_wash, p.accent),
        (&mut v.widgets.open, p.hover, p.edge),
    ] {
        state.weak_bg_fill = fill;
        state.bg_fill = fill;
        state.bg_stroke = Stroke::new(1.0, outline);
        state.fg_stroke = Stroke::new(1.0, p.ink);
        state.corner_radius = field;
        state.expansion = 0.0;
    }
    v.button_frame = true;

    style.text_styles = [
        (
            TextStyle::Body,
            FontId::new(ty::BODY, FontFamily::Proportional),
        ),
        (
            TextStyle::Button,
            FontId::new(ty::BUTTON, FontFamily::Proportional),
        ),
        (
            TextStyle::Small,
            FontId::new(ty::LABEL, FontFamily::Proportional),
        ),
        (TextStyle::Heading, FontId::new(ty::PANEL, serif_family())),
        (
            TextStyle::Monospace,
            FontId::new(13.0, FontFamily::Monospace),
        ),
    ]
    .into();
    style.spacing.item_spacing = egui::vec2(10.0, 8.0);
    style.spacing.button_padding = egui::vec2(14.0, 7.0);
    style.spacing.interact_size.y = 32.0;
}

// ---------- text roles ----------

/// A page or panel title in the house serif. The caller sets the size.
pub fn serif(text: impl Into<String>) -> RichText {
    RichText::new(text).family(serif_family()).color(pal().ink)
}

/// Real bold sans. `RichText::strong` only darkens the colour.
pub fn strong(text: impl Into<String>) -> RichText {
    RichText::new(text).family(bold_family()).color(pal().ink)
}

/// Body prose.
pub fn body(text: impl Into<String>) -> RichText {
    RichText::new(text).size(ty::BODY).color(pal().text)
}

/// A meta line or status word.
pub fn meta(text: impl Into<String>) -> RichText {
    RichText::new(text).size(ty::META).color(pal().text)
}

/// Secondary text. Only on the desk or a card, where it keeps its contrast.
pub fn muted(text: impl Into<String>) -> RichText {
    RichText::new(text).size(ty::META).color(pal().muted)
}

/// Paints the faint 24 px graph-paper grid across `rect`.
pub fn paint_grid(painter: &egui::Painter, rect: egui::Rect) {
    const STEP: f32 = 24.0;
    let stroke = Stroke::new(1.0, pal().grid);
    let mut x = (rect.left() / STEP).floor() * STEP;
    while x <= rect.right() {
        painter.line_segment(
            [egui::pos2(x, rect.top()), egui::pos2(x, rect.bottom())],
            stroke,
        );
        x += STEP;
    }
    let mut y = (rect.top() / STEP).floor() * STEP;
    while y <= rect.bottom() {
        painter.line_segment(
            [egui::pos2(rect.left(), y), egui::pos2(rect.right(), y)],
            stroke,
        );
        y += STEP;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn contrast(a: Color32, b: Color32) -> f32 {
        let luminance = |c: Color32| {
            let channel = |v: u8| {
                let v = f32::from(v) / 255.0;
                if v <= 0.03928 {
                    v / 12.92
                } else {
                    ((v + 0.055) / 1.055).powf(2.4)
                }
            };
            0.2126 * channel(c.r()) + 0.7152 * channel(c.g()) + 0.0722 * channel(c.b())
        };
        let (x, y) = (luminance(a), luminance(b));
        (x.max(y) + 0.05) / (x.min(y) + 0.05)
    }

    #[test]
    fn text_is_readable_on_every_surface_it_sits_on() {
        for (name, p) in [("light", LIGHT), ("dark", DARK)] {
            for (role, colour) in [("ink", p.ink), ("text", p.text), ("muted", p.muted)] {
                for (surface, fill) in [("desk", p.desk), ("card", p.card)] {
                    let ratio = contrast(colour, fill);
                    assert!(ratio >= 4.5, "{name}: {role} on {surface} is {ratio:.2}");
                }
            }
            for (role, colour) in [("danger", p.danger), ("warn", p.warn), ("accent", p.accent)] {
                let ratio = contrast(colour, p.card);
                assert!(ratio >= 4.5, "{name}: {role} on card is {ratio:.2}");
            }
            assert!(
                contrast(p.on_accent, p.accent) >= 4.5,
                "{name}: primary button label"
            );
            assert!(
                contrast(ON_HIGHLIGHTER, p.highlighter) >= 4.5,
                "{name}: marker label"
            );
            assert!(
                contrast(p.ink, p.accent_wash) >= 4.5,
                "{name}: selected row"
            );
            assert!(contrast(DOCK_TEXT, p.rail) >= 4.5, "{name}: dock labels");
        }
    }

    #[test]
    fn a_control_outline_reads_as_a_control() {
        for (name, p) in [("light", LIGHT), ("dark", DARK)] {
            assert!(contrast(p.edge, p.card) >= 3.0, "{name}: edge on card");
            assert!(contrast(p.edge, p.desk) >= 3.0, "{name}: edge on desk");
        }
    }

    #[test]
    fn every_family_names_only_registered_faces() {
        let defs = fonts();
        for (family, faces) in &defs.families {
            assert!(!faces.is_empty(), "{family:?} is empty");
            for face in faces {
                assert!(
                    defs.font_data.contains_key(face),
                    "{family:?} names unknown {face}"
                );
            }
        }
        assert_eq!(
            defs.families[&FontFamily::Proportional]
                .first()
                .map(String::as_str),
            Some(SANS_FACE)
        );
    }
}
