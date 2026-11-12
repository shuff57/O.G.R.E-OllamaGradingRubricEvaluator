//! The house widgets. Screens build from these instead of styling by hand:
//! one primary button, ghost buttons for everything else, cards, pills,
//! section labels, the page header and the dock.

use eframe::egui::{
    self, Align2, Color32, CornerRadius, Frame, Margin, Response, RichText, Role, Sense, Stroke,
    StrokeKind, Ui, Vec2, WidgetInfo,
};

use crate::theme::{self, R_CARD, R_FIELD, icon, pal, ty};

const BUTTON_HEIGHT: f32 = 36.0;

/// The one primary button: a filled accent pill for the step to take next.
/// A screen shows at most one.
pub fn primary(ui: &mut Ui, label: &str, enabled: bool) -> Response {
    let p = pal();
    // On the dark desk the accent is a pale mint, which as a fill reads like a
    // half-disabled button beside an outlined one. There the primary is a
    // full-strength green with white text instead, as in verSHion.
    let (fill, text, toward) = if theme::is_dark() {
        (
            Color32::from_rgb(0x2f, 0x7a, 0x4b),
            Color32::WHITE,
            Color32::WHITE,
        )
    } else {
        (p.accent, p.on_accent, Color32::BLACK)
    };
    button(
        ui,
        label,
        enabled,
        text,
        [
            fill,
            fill.lerp_to_gamma(toward, 0.12),
            fill.lerp_to_gamma(toward, 0.22),
        ],
        Stroke::NONE,
    )
}

/// The button for every other action: card-coloured with a visible outline.
pub fn ghost(ui: &mut Ui, label: &str, enabled: bool) -> Response {
    let p = pal();
    button(
        ui,
        label,
        enabled,
        p.ink,
        [p.card, p.hover, p.accent_wash],
        Stroke::new(1.0, p.edge),
    )
}

fn button(
    ui: &mut Ui,
    label: &str,
    enabled: bool,
    text: Color32,
    [rest, hover, press]: [Color32; 3],
    outline: Stroke,
) -> Response {
    let p = pal();
    ui.scope(|ui| {
        ui.spacing_mut().button_padding = Vec2::new(18.0, 4.0);
        let widgets = &mut ui.visuals_mut().widgets;
        for (state, fill) in [
            (&mut widgets.inactive, rest),
            (&mut widgets.hovered, hover),
            (&mut widgets.active, press),
        ] {
            state.weak_bg_fill = fill;
            state.bg_fill = fill;
            state.bg_stroke = outline;
        }
        // A button that cannot be pressed yet is flat and unoutlined, so it
        // cannot be mistaken for either a primary or a ghost.
        if !enabled {
            widgets.inactive.weak_bg_fill = p.field;
            widgets.inactive.bg_fill = p.field;
            widgets.inactive.bg_stroke = Stroke::NONE;
        }
        let colour = if enabled { text } else { p.muted };
        let text = RichText::new(label)
            .family(theme::bold_family())
            .size(ty::BUTTON)
            .color(colour);
        let response = ui.add_enabled(
            enabled,
            egui::Button::new(text).min_size(Vec2::new(0.0, BUTTON_HEIGHT)),
        );
        if response.has_focus() {
            ui.painter().rect_stroke(
                response.rect.expand(1.0),
                CornerRadius::same(R_FIELD + 1),
                Stroke::new(2.0, p.accent),
                StrokeKind::Outside,
            );
        }
        response.on_hover_cursor(egui::CursorIcon::PointingHand)
    })
    .inner
}

/// A square button that shows only an icon. `label` is what it is called
/// for a screen reader and on hover.
pub fn icon_button(ui: &mut Ui, icon: &str, label: &str, enabled: bool) -> Response {
    let p = pal();
    let sense = if enabled {
        Sense::click()
    } else {
        Sense::hover()
    };
    let (rect, response) = ui.allocate_exact_size(Vec2::splat(BUTTON_HEIGHT), sense);
    let radius = CornerRadius::same(R_FIELD);
    let fill = if !enabled {
        p.field
    } else if response.is_pointer_button_down_on() {
        p.accent_wash
    } else if response.hovered() {
        p.hover
    } else {
        p.card
    };
    ui.painter().rect_filled(rect, radius, fill);
    if enabled {
        ui.painter()
            .rect_stroke(rect, radius, Stroke::new(1.0, p.edge), StrokeKind::Inside);
    }
    if response.has_focus() {
        ui.painter().rect_stroke(
            rect.expand(1.0),
            CornerRadius::same(R_FIELD + 1),
            Stroke::new(2.0, p.accent),
            StrokeKind::Outside,
        );
    }
    ui.painter().text(
        rect.center(),
        Align2::CENTER_CENTER,
        icon,
        theme::icon_font(18.0),
        if enabled { p.ink } else { p.muted },
    );
    response.widget_info(|| WidgetInfo::labeled(Role::Button, enabled, label));
    response
        .on_hover_text(label)
        .on_hover_cursor(egui::CursorIcon::PointingHand)
}

/// A card: the surface content sits on. Hairline border, no shadow.
pub fn card() -> Frame {
    Frame::new()
        .fill(pal().card)
        .stroke(Stroke::new(1.0, pal().border))
        .corner_radius(CornerRadius::same(R_CARD))
        .inner_margin(Margin::same(16))
}

/// A card as wide as the space it is in.
pub fn wide_card<R>(ui: &mut Ui, contents: impl FnOnce(&mut Ui) -> R) -> egui::InnerResponse<R> {
    card().show(ui, |ui| {
        ui.set_width(ui.available_width());
        contents(ui)
    })
}

/// How a screen starts: a small breadcrumb, a serif title, an optional
/// subtitle. There is no top bar.
pub fn page_header(ui: &mut Ui, crumbs: &str, title: &str, subtitle: Option<&str>) {
    ui.add_space(6.0);
    ui.label(theme::muted(crumbs));
    ui.label(theme::serif(title).size(ty::TITLE));
    if let Some(subtitle) = subtitle {
        ui.label(theme::muted(subtitle).size(ty::BODY));
    }
    ui.add_space(8.0);
}

/// A panel's heading in the house serif.
pub fn panel_title(ui: &mut Ui, text: &str) -> Response {
    ui.label(theme::serif(text).size(ty::PANEL))
}

/// A section label: small bold capitals, letter-spaced, muted. It names a
/// section; it never carries a fact.
///
/// Screen readers get the plain words, not the spaced capitals.
pub fn section_label(ui: &mut Ui, text: &str) -> Response {
    // egui has no letter-spacing; hair spaces between letters stand in for it.
    let spaced: String = text
        .to_uppercase()
        .chars()
        .flat_map(|c| [c, '\u{200A}'])
        .collect();
    let font = egui::FontId::new(ty::LABEL, theme::bold_family());
    let galley = ui.painter().layout_no_wrap(spaced, font, pal().muted);
    let (rect, response) = ui.allocate_exact_size(galley.size(), Sense::hover());
    ui.painter().galley(rect.min, galley, pal().muted);
    response.widget_info(|| WidgetInfo::labeled(Role::Label, true, text));
    response
}

/// A small filled pill.
pub fn pill(ui: &mut Ui, label: &str, fill: Color32, text: Color32) -> Response {
    Frame::new()
        .fill(fill)
        .corner_radius(CornerRadius::same(255))
        .inner_margin(Margin::symmetric(9, 2))
        .show(ui, |ui| {
            ui.add(
                egui::Label::new(
                    RichText::new(label)
                        .family(theme::bold_family())
                        .size(ty::LABEL)
                        .color(text),
                )
                .wrap_mode(egui::TextWrapMode::Extend),
            );
        })
        .response
}

/// A calm status: accent wash with accent text.
pub fn calm_pill(ui: &mut Ui, label: &str) -> Response {
    pill(ui, label, pal().accent_wash, pal().accent)
}

/// The marker: highlighter fill, dark ink. For the thing that just changed
/// or needs the teacher's eye. Used sparingly.
pub fn marker_pill(ui: &mut Ui, label: &str) -> Response {
    pill(ui, label, pal().highlighter, theme::ON_HIGHLIGHTER)
}

/// A line of text led by an icon, in one colour.
pub fn icon_line(ui: &mut Ui, icon: &str, text: &str, colour: Color32) {
    ui.horizontal_wrapped(|ui| {
        ui.spacing_mut().item_spacing.x = 6.0;
        // Painted, not a label: the glyph means nothing to a screen reader.
        let (rect, _) = ui.allocate_exact_size(Vec2::splat(18.0), Sense::hover());
        ui.painter().text(
            rect.center(),
            Align2::CENTER_CENTER,
            icon,
            theme::icon_font(16.0),
            colour,
        );
        ui.label(RichText::new(text).size(ty::BODY).color(colour));
    });
}

/// Something the teacher should know before going on.
pub fn warning(ui: &mut Ui, text: &str) {
    icon_line(ui, icon::WARNING, text, pal().warn);
}

/// A warning that asks, with a button to go ahead and, where there is a
/// choice, one to back out. `Some(true)` when the teacher goes ahead,
/// `Some(false)` when they back out.
pub fn confirm(
    ui: &mut Ui,
    question: &str,
    yes: &str,
    yes_enabled: bool,
    no: Option<&str>,
) -> Option<bool> {
    warning(ui, question);
    let mut answer = None;
    ui.horizontal(|ui| {
        if ghost(ui, yes, yes_enabled).clicked() {
            answer = Some(true);
        }
        if let Some(no) = no
            && ghost(ui, no, true).clicked()
        {
            answer = Some(false);
        }
    });
    answer
}

/// Width of the dock itself.
pub const DOCK_WIDTH: f32 = 88.0;
/// Padding between the window edge and the dock.
pub const APP_PADDING: f32 = 10.0;

/// One entry of the dock: an icon over a short label. The active one wears
/// the highlighter. Returns true when clicked.
pub fn dock_item(ui: &mut Ui, icon: &str, label: &str, active: bool) -> bool {
    let (rect, response) = ui.allocate_exact_size(Vec2::new(70.0, 56.0), Sense::click());
    let radius = CornerRadius::same(13);
    if active {
        ui.painter().rect_filled(rect, radius, pal().highlighter);
    } else if response.hovered() || response.has_focus() {
        ui.painter()
            .rect_filled(rect, radius, theme::DOCK_TEXT.gamma_multiply(0.12));
    }
    let colour = if active {
        theme::ON_HIGHLIGHTER
    } else {
        theme::DOCK_TEXT
    };
    ui.painter().text(
        egui::pos2(rect.center().x, rect.top() + 21.0),
        Align2::CENTER_CENTER,
        icon,
        theme::icon_font(21.0),
        colour,
    );
    ui.painter().text(
        egui::pos2(rect.center().x, rect.bottom() - 12.0),
        Align2::CENTER_CENTER,
        label,
        egui::FontId::new(11.0, theme::bold_family()),
        colour,
    );
    response.widget_info(|| WidgetInfo::selected(Role::Button, true, active, label));
    response
        .on_hover_cursor(egui::CursorIcon::PointingHand)
        .clicked()
}

/// The light/dark switch at the foot of the dock. Returns true when clicked.
pub fn theme_switch(ui: &mut Ui, dark: bool) -> bool {
    let (rect, response) = ui.allocate_exact_size(Vec2::new(70.0, 40.0), Sense::click());
    if response.hovered() || response.has_focus() {
        ui.painter().rect_filled(
            rect,
            CornerRadius::same(13),
            theme::DOCK_TEXT.gamma_multiply(0.12),
        );
    }
    let icon = if dark {
        theme::icon::SUN
    } else {
        theme::icon::MOON
    };
    ui.painter().text(
        rect.center(),
        Align2::CENTER_CENTER,
        icon,
        theme::icon_font(20.0),
        theme::DOCK_TEXT,
    );
    let label = if dark {
        "Switch to light mode"
    } else {
        "Switch to dark mode"
    };
    response.widget_info(|| WidgetInfo::labeled(Role::Button, true, label));
    response
        .on_hover_text(label)
        .on_hover_cursor(egui::CursorIcon::PointingHand)
        .clicked()
}
