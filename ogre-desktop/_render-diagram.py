"""
Grading Weights Flow Diagram — Signal Cartography style
Renders a dark-themed technical diagram showing how UI weight sliders
flow through the system to control AI grading behavior.
"""
from PIL import Image, ImageDraw, ImageFont
import os

FONT_DIR = r"C:\Users\shuff57\.claude\skills\canvas-design\canvas-fonts"
OUT = os.path.join(os.path.dirname(__file__), "grading-weights-flow.png")

W, H = 2400, 1600

# Colors — Signal Cartography palette
BG        = (12, 14, 20)
DARK_PANEL = (20, 23, 32)
BORDER    = (45, 50, 65)
SUBTLE    = (70, 78, 100)
TEXT      = (200, 205, 215)
TEXT_DIM  = (120, 128, 150)
ACCENT_UI = (99, 102, 241)    # indigo — UI stage
ACCENT_API = (34, 197, 180)   # teal — API transport
ACCENT_PROMPT = (251, 191, 36) # amber — prompt builder
ACCENT_AI = (239, 68, 68)     # red — AI execution
WHITE     = (255, 255, 255)

# Connector colors matching source
CONN_ANCHOR  = (168, 130, 255)  # purple for anchor flow
CONN_CT      = (34, 197, 180)   # teal for CT flow
CONN_FLOOR   = (251, 191, 36)   # amber for floor flow

def load_font(name, size):
    path = os.path.join(FONT_DIR, name)
    try:
        return ImageFont.truetype(path, size)
    except:
        return ImageFont.load_default()

# Fonts
f_title    = load_font("Jura-Medium.ttf", 36)
f_stage    = load_font("InstrumentSans-Bold.ttf", 22)
f_label    = load_font("InstrumentSans-Regular.ttf", 17)
f_label_b  = load_font("InstrumentSans-Bold.ttf", 17)
f_mono     = load_font("JetBrainsMono-Regular.ttf", 14)
f_mono_b   = load_font("JetBrainsMono-Bold.ttf", 14)
f_small    = load_font("JetBrainsMono-Regular.ttf", 12)
f_tiny     = load_font("InstrumentSans-Regular.ttf", 13)

img = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(img)

# ── Helper functions ──
def rounded_rect(x, y, w, h, r, fill=None, outline=None, width=1):
    draw.rounded_rectangle([x, y, x+w, y+h], radius=r, fill=fill, outline=outline, width=width)

def draw_arrow(x1, y1, x2, y2, color, width=2, head=8):
    draw.line([(x1, y1), (x2, y2)], fill=color, width=width)
    # Arrowhead
    import math
    angle = math.atan2(y2 - y1, x2 - x1)
    ax1 = x2 - head * math.cos(angle - 0.4)
    ay1 = y2 - head * math.sin(angle - 0.4)
    ax2 = x2 - head * math.cos(angle + 0.4)
    ay2 = y2 - head * math.sin(angle + 0.4)
    draw.polygon([(x2, y2), (int(ax1), int(ay1)), (int(ax2), int(ay2))], fill=color)

def draw_dashed_line(x1, y1, x2, y2, color, width=1, dash=8, gap=6):
    import math
    dx = x2 - x1
    dy = y2 - y1
    length = math.sqrt(dx*dx + dy*dy)
    if length == 0: return
    ux, uy = dx/length, dy/length
    pos = 0
    while pos < length:
        sx = x1 + ux * pos
        sy = y1 + uy * pos
        end = min(pos + dash, length)
        ex = x1 + ux * end
        ey = y1 + uy * end
        draw.line([(int(sx), int(sy)), (int(ex), int(ey))], fill=color, width=width)
        pos += dash + gap

def text_c(x, y, text, font, fill=TEXT):
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    draw.text((x - tw//2, y), text, font=font, fill=fill)

# ── Title ──
draw.text((60, 30), "GRADING WEIGHTS SIGNAL FLOW", font=f_title, fill=TEXT)
draw.text((60, 72), "How UI slider adjustments propagate through the system to shape AI grading behavior", font=f_tiny, fill=TEXT_DIM)

# ── Stage positions (4 columns) ──
COL_X = [60, 640, 1200, 1860]
COL_W = [520, 500, 600, 480]
TOP = 120
STAGE_H = 1400

# ── Stage 1: UI ──
sx, sw = COL_X[0], COL_W[0]
rounded_rect(sx, TOP, sw, STAGE_H, 12, fill=DARK_PANEL, outline=ACCENT_UI, width=2)
# Stage header
draw.rectangle([sx, TOP, sx+sw, TOP+50], fill=(*ACCENT_UI, 40))
rounded_rect(sx, TOP, sw, 50, 12, outline=ACCENT_UI, width=2)
draw.rectangle([sx+1, TOP+38, sx+sw-1, TOP+50], fill=DARK_PANEL)
text_c(sx + sw//2, TOP+12, "STAGE 1 — UI", f_stage, ACCENT_UI)

# File label
draw.text((sx+20, TOP+65), "BatchWeights.svelte", font=f_mono, fill=TEXT_DIM)

# Presets
py = TOP + 100
draw.text((sx+20, py), "PRESETS", font=f_label_b, fill=TEXT)
py += 30
for preset, color_mix in [("Lenient", (100, 200, 140)), ("Default", (180, 180, 190)), ("Strict", (230, 120, 100))]:
    rounded_rect(sx+20, py, 150, 32, 6, outline=color_mix, width=1)
    text_c(sx+95, py+6, preset, f_label, color_mix)
    py += 42

# Score Floor slider
py += 20
draw.text((sx+20, py), "SCORE FLOOR", font=f_label_b, fill=CONN_FLOOR)
py += 25
draw.text((sx+20, py), "Min score when all criteria met", font=f_tiny, fill=TEXT_DIM)
py += 22
# Slider track
draw.rounded_rectangle([sx+20, py+4, sx+sw-20, py+12], radius=4, fill=BORDER)
# Slider thumb
thumb_x = sx + 20 + int((sw-40) * 0.6)
draw.ellipse([thumb_x-8, py, thumb_x+8, py+16], fill=CONN_FLOOR)
# Range labels
draw.text((sx+20, py+22), "6", font=f_small, fill=TEXT_DIM)
draw.text((sx+sw-35, py+22), "9", font=f_small, fill=TEXT_DIM)
# Value
draw.text((thumb_x+14, py-2), "8", font=f_mono_b, fill=CONN_FLOOR)
py += 55

# Conceptual Thoroughness
draw.text((sx+20, py), "CONCEPTUAL THOROUGHNESS", font=f_label_b, fill=CONN_CT)
py += 25
draw.text((sx+20, py), "Credit for concept mastery + flawed execution", font=f_tiny, fill=TEXT_DIM)
py += 22
# Dual slider
draw.rounded_rectangle([sx+20, py+4, sx+sw-20, py+12], radius=4, fill=BORDER)
t1 = sx + 20 + int((sw-40) * 0.35)
t2 = sx + 20 + int((sw-40) * 0.65)
draw.rounded_rectangle([t1, py+2, t2, py+14], radius=4, fill=(*CONN_CT, 60))
draw.ellipse([t1-6, py, t1+6, py+16], fill=CONN_CT)
draw.ellipse([t2-6, py, t2+6, py+16], fill=CONN_CT)
draw.text((sx+20, py+22), "30%", font=f_small, fill=TEXT_DIM)
draw.text((sx+sw-50, py+22), "95%", font=f_small, fill=TEXT_DIM)
draw.text((t1-8, py-18), "60", font=f_mono_b, fill=CONN_CT)
draw.text((t2-8, py-18), "80", font=f_mono_b, fill=CONN_CT)
py += 55

# Anchor Positions
draw.text((sx+20, py), "ANCHOR POSITIONS", font=f_label_b, fill=CONN_ANCHOR)
py += 25
draw.text((sx+20, py), "Score tier calibration points", font=f_tiny, fill=TEXT_DIM)
py += 25

anchors = [
    ("Excellent", 0.95, "95%"),
    ("Adequate", 0.80, "80%"),
    ("Below Average", 0.65, "65%"),
    ("Minimal", 0.45, "45%"),
]
for name, pct, label in anchors:
    draw.text((sx+20, py), name, font=f_label, fill=TEXT)
    # Mini slider
    track_x = sx + 180
    track_w = sw - 220
    draw.rounded_rectangle([track_x, py+6, track_x+track_w, py+12], radius=3, fill=BORDER)
    tx = track_x + int(track_w * pct)
    draw.ellipse([tx-5, py+4, tx+5, py+14], fill=CONN_ANCHOR)
    draw.text((track_x+track_w+10, py+1), label, font=f_mono, fill=CONN_ANCHOR)
    py += 32

# Output object
py += 20
rounded_rect(sx+20, py, sw-40, 80, 8, fill=(25, 28, 40), outline=BORDER)
draw.text((sx+35, py+8), "GradingWeights {", font=f_mono, fill=TEXT_DIM)
draw.text((sx+45, py+26), "scoreFloor: 8", font=f_mono, fill=CONN_FLOOR)
draw.text((sx+45, py+42), "conceptualThoroughness: [60, 80]", font=f_small, fill=CONN_CT)
draw.text((sx+45, py+58), "anchorExcellent: 0.95 ...", font=f_small, fill=CONN_ANCHOR)

# ── Stage 2: API Layer ──
sx2, sw2 = COL_X[1], COL_W[1]
rounded_rect(sx2, TOP, sw2, STAGE_H, 12, fill=DARK_PANEL, outline=ACCENT_API, width=2)
draw.rectangle([sx2, TOP, sx2+sw2, TOP+50], fill=(*ACCENT_API, 30))
rounded_rect(sx2, TOP, sw2, 50, 12, outline=ACCENT_API, width=2)
draw.rectangle([sx2+1, TOP+38, sx2+sw2-1, TOP+50], fill=DARK_PANEL)
text_c(sx2 + sw2//2, TOP+12, "STAGE 2 — TRANSPORT", f_stage, ACCENT_API)

ty = TOP + 80
draw.text((sx2+20, ty), "grading-api.ts", font=f_mono, fill=TEXT_DIM)
ty += 30

# Request body
rounded_rect(sx2+20, ty, sw2-40, 220, 8, fill=(25, 28, 40), outline=BORDER)
draw.text((sx2+35, ty+10), "POST /api/grade", font=f_mono_b, fill=ACCENT_API)
ty += 35
draw.text((sx2+35, ty+5), "Content-Type: application/json", font=f_small, fill=TEXT_DIM)
ty += 25
draw.text((sx2+35, ty+5), "{", font=f_mono, fill=TEXT_DIM)
draw.text((sx2+50, ty+22), "provider: 'ollama',", font=f_small, fill=TEXT_DIM)
draw.text((sx2+50, ty+38), "model: 'nemotron-3-super',", font=f_small, fill=TEXT_DIM)
draw.text((sx2+50, ty+54), "rubric: { ... },", font=f_small, fill=TEXT_DIM)
draw.text((sx2+50, ty+70), "students: [ ... ],", font=f_small, fill=TEXT_DIM)
draw.text((sx2+50, ty+90), "gradingWeights: {", font=f_small, fill=WHITE)
draw.text((sx2+70, ty+106), "scoreFloor,", font=f_small, fill=CONN_FLOOR)
draw.text((sx2+70, ty+120), "conceptualThoroughness,", font=f_small, fill=CONN_CT)
draw.text((sx2+70, ty+134), "anchorExcellent, ...", font=f_small, fill=CONN_ANCHOR)
draw.text((sx2+50, ty+150), "}", font=f_small, fill=WHITE)

# Server arrow
ty2 = ty + 200
draw.text((sx2+20, ty2), "server.js", font=f_mono, fill=TEXT_DIM)
ty2 += 25
draw_arrow(sx2 + sw2//2, ty2-5, sx2 + sw2//2, ty2+15, ACCENT_API, 2)
ty2 += 25
draw.text((sx2+20, ty2), "Destructures gradingWeights", font=f_tiny, fill=TEXT_DIM)
ty2 += 20
draw.text((sx2+20, ty2), "from request body, passes to", font=f_tiny, fill=TEXT_DIM)
ty2 += 20
draw.text((sx2+20, ty2), "prompt builder functions", font=f_tiny, fill=TEXT_DIM)

# Three output arrows from Stage 2
# These will connect to Stage 3 sections
arrow_start_x = sx2 + sw2

# ── Stage 3: Prompt Builder ──
sx3, sw3 = COL_X[2], COL_W[2]
rounded_rect(sx3, TOP, sw3, STAGE_H, 12, fill=DARK_PANEL, outline=ACCENT_PROMPT, width=2)
draw.rectangle([sx3, TOP, sx3+sw3, TOP+50], fill=(*ACCENT_PROMPT, 25))
rounded_rect(sx3, TOP, sw3, 50, 12, outline=ACCENT_PROMPT, width=2)
draw.rectangle([sx3+1, TOP+38, sx3+sw3-1, TOP+50], fill=DARK_PANEL)
text_c(sx3 + sw3//2, TOP+12, "STAGE 3 — PROMPT BUILDER", f_stage, ACCENT_PROMPT)

py3 = TOP + 75
draw.text((sx3+20, py3), "grading.js", font=f_mono, fill=TEXT_DIM)
py3 += 35

# Section A: Anchors
rounded_rect(sx3+15, py3, sw3-30, 260, 8, fill=(30, 28, 18), outline=CONN_ANCHOR, width=1)
draw.text((sx3+30, py3+10), "A", font=f_stage, fill=CONN_ANCHOR)
draw.text((sx3+55, py3+12), "generateScoringAnchors()", font=f_mono, fill=CONN_ANCHOR)
py3a = py3 + 42
draw.text((sx3+30, py3a), "Uses anchor percentages to compute", font=f_tiny, fill=TEXT_DIM)
draw.text((sx3+30, py3a+18), "calibration score tiers:", font=f_tiny, fill=TEXT_DIM)
py3a += 42
pairs = [
    ("anchorExcellent: 0.95", '"Excellent (9.5/10)"'),
    ("anchorAdequate: 0.80", '"Adequate (8/10)"'),
    ("anchorBelowAverage: 0.65", '"Below Avg (6.5/10)"'),
    ("anchorMinimal: 0.45", '"Minimal (4.5/10)"'),
]
for inp, out in pairs:
    draw.text((sx3+30, py3a), inp, font=f_small, fill=CONN_ANCHOR)
    draw.text((sx3+30, py3a+16), "  ->  " + out, font=f_small, fill=TEXT)
    py3a += 38

# Section B: CT Rule
py3 = py3 + 275
rounded_rect(sx3+15, py3, sw3-30, 180, 8, fill=(18, 30, 28), outline=CONN_CT, width=1)
draw.text((sx3+30, py3+10), "B", font=f_stage, fill=CONN_CT)
draw.text((sx3+55, py3+12), "CONCEPTUAL THOROUGHNESS RULE", font=f_mono, fill=CONN_CT)
py3b = py3 + 42
draw.text((sx3+30, py3b), "Injected into prompt as partial credit rule:", font=f_tiny, fill=TEXT_DIM)
py3b += 25
draw.text((sx3+30, py3b), "conceptualThoroughness: [60, 80]", font=f_small, fill=CONN_CT)
py3b += 22
draw.text((sx3+30, py3b), '  ->  "award 60-80% of that', font=f_small, fill=TEXT)
draw.text((sx3+30, py3b+16), '       criterion\'s points"', font=f_small, fill=TEXT)
py3b += 40
draw.text((sx3+30, py3b), "Student understands concept but", font=f_tiny, fill=TEXT_DIM)
draw.text((sx3+30, py3b+16), "execution is flawed -> this band applies", font=f_tiny, fill=TEXT_DIM)

# Section C: Score Floor
py3 = py3 + 195
rounded_rect(sx3+15, py3, sw3-30, 200, 8, fill=(30, 26, 16), outline=CONN_FLOOR, width=1)
draw.text((sx3+30, py3+10), "C", font=f_stage, fill=CONN_FLOOR)
draw.text((sx3+55, py3+12), "CRITICAL BLOCK", font=f_mono, fill=CONN_FLOOR)
py3c = py3 + 42
draw.text((sx3+30, py3c), "Sets the minimum score when all rubric", font=f_tiny, fill=TEXT_DIM)
draw.text((sx3+30, py3c+16), "criteria are addressed:", font=f_tiny, fill=TEXT_DIM)
py3c += 42
draw.text((sx3+30, py3c), "scoreFloor: 8", font=f_small, fill=CONN_FLOOR)
py3c += 22
draw.text((sx3+30, py3c), '  ->  "A response that correctly', font=f_small, fill=TEXT)
draw.text((sx3+30, py3c+16), '       hits every rubric criterion', font=f_small, fill=TEXT)
draw.text((sx3+30, py3c+32), '       earns 8-9"', font=f_small, fill=TEXT)
py3c += 55
draw.text((sx3+30, py3c), "Lenient: floor=9 (generous)", font=f_tiny, fill=(100, 200, 140))
draw.text((sx3+30, py3c+16), "Strict:  floor=7 (earn the rest)", font=f_tiny, fill=(230, 120, 100))

# Assembled prompt indicator
py3 = py3 + 220
rounded_rect(sx3+15, py3, sw3-30, 60, 8, fill=(25, 28, 40), outline=ACCENT_PROMPT, width=1)
text_c(sx3 + sw3//2, py3+8, "ASSEMBLED PROMPT", f_label_b, ACCENT_PROMPT)
text_c(sx3 + sw3//2, py3+32, "A + B + C + rubric + students", f_small, TEXT_DIM)

# ── Stage 4: AI Model ──
sx4, sw4 = COL_X[3], COL_W[3]
rounded_rect(sx4, TOP, sw4, STAGE_H, 12, fill=DARK_PANEL, outline=ACCENT_AI, width=2)
draw.rectangle([sx4, TOP, sx4+sw4, TOP+50], fill=(*ACCENT_AI, 25))
rounded_rect(sx4, TOP, sw4, 50, 12, outline=ACCENT_AI, width=2)
draw.rectangle([sx4+1, TOP+38, sx4+sw4-1, TOP+50], fill=DARK_PANEL)
text_c(sx4 + sw4//2, TOP+12, "STAGE 4 — AI MODEL", f_stage, ACCENT_AI)

py4 = TOP + 80
draw.text((sx4+20, py4), "LLM reads assembled prompt", font=f_tiny, fill=TEXT_DIM)
py4 += 30

# AI reads anchors
rounded_rect(sx4+15, py4, sw4-30, 120, 8, fill=(30, 20, 22), outline=CONN_ANCHOR, width=1)
draw.text((sx4+30, py4+10), "READS ANCHORS", font=f_label_b, fill=CONN_ANCHOR)
draw.text((sx4+30, py4+35), "Uses tier scores as", font=f_tiny, fill=TEXT_DIM)
draw.text((sx4+30, py4+51), "calibration reference to", font=f_tiny, fill=TEXT_DIM)
draw.text((sx4+30, py4+67), "place each student on", font=f_tiny, fill=TEXT_DIM)
draw.text((sx4+30, py4+83), "the scoring scale", font=f_tiny, fill=TEXT_DIM)
py4 += 135

# AI reads CT
rounded_rect(sx4+15, py4, sw4-30, 120, 8, fill=(20, 30, 28), outline=CONN_CT, width=1)
draw.text((sx4+30, py4+10), "APPLIES CT RULE", font=f_label_b, fill=CONN_CT)
draw.text((sx4+30, py4+35), "Decides partial credit", font=f_tiny, fill=TEXT_DIM)
draw.text((sx4+30, py4+51), "when student shows", font=f_tiny, fill=TEXT_DIM)
draw.text((sx4+30, py4+67), "understanding but has", font=f_tiny, fill=TEXT_DIM)
draw.text((sx4+30, py4+83), "execution flaws", font=f_tiny, fill=TEXT_DIM)
py4 += 135

# AI reads floor
rounded_rect(sx4+15, py4, sw4-30, 120, 8, fill=(30, 26, 18), outline=CONN_FLOOR, width=1)
draw.text((sx4+30, py4+10), "ENFORCES FLOOR", font=f_label_b, fill=CONN_FLOOR)
draw.text((sx4+30, py4+35), "Sets minimum score", font=f_tiny, fill=TEXT_DIM)
draw.text((sx4+30, py4+51), "when all rubric criteria", font=f_tiny, fill=TEXT_DIM)
draw.text((sx4+30, py4+67), "are substantively", font=f_tiny, fill=TEXT_DIM)
draw.text((sx4+30, py4+83), "addressed", font=f_tiny, fill=TEXT_DIM)
py4 += 145

# Output
rounded_rect(sx4+15, py4, sw4-30, 100, 8, fill=(25, 28, 40), outline=ACCENT_AI, width=2)
text_c(sx4 + sw4//2, py4+10, "OUTPUT", f_label_b, ACCENT_AI)
draw.text((sx4+30, py4+38), '{ score: 8,', font=f_mono, fill=WHITE)
draw.text((sx4+30, py4+56), '  feedback: "..." }', font=f_mono, fill=WHITE)

# ── Connection arrows between stages ──

# Stage 1 -> Stage 2 (main arrow)
draw_arrow(COL_X[0]+COL_W[0], TOP + STAGE_H//2, COL_X[1], TOP + STAGE_H//2, ACCENT_API, 3)

# Stage 2 -> Stage 3 Section A (anchors — purple)
a_y = TOP + 110 + 210
draw_arrow(sx2+sw2, a_y, sx3, a_y, CONN_ANCHOR, 2)

# Stage 2 -> Stage 3 Section B (CT — teal)
b_y = TOP + 110 + 420
draw_arrow(sx2+sw2, b_y, sx3, b_y, CONN_CT, 2)

# Stage 2 -> Stage 3 Section C (floor — amber)
c_y = TOP + 110 + 600
draw_arrow(sx2+sw2, c_y, sx3, c_y, CONN_FLOOR, 2)

# Stage 3 -> Stage 4 (assembled prompt)
prompt_out_y = TOP + 110 + 760
draw_arrow(sx3+sw3, prompt_out_y, sx4, prompt_out_y, ACCENT_AI, 3)

# ── Legend at bottom ──
ly = H - 55
draw.text((60, ly), "SIGNAL LEGEND:", font=f_label_b, fill=TEXT_DIM)
items = [
    (200, CONN_ANCHOR, "Anchor Positions"),
    (420, CONN_CT, "Conceptual Thoroughness"),
    (700, CONN_FLOOR, "Score Floor"),
    (910, ACCENT_UI, "UI"),
    (990, ACCENT_API, "Transport"),
    (1110, ACCENT_PROMPT, "Prompt"),
    (1220, ACCENT_AI, "AI"),
]
for x, color, label in items:
    draw.rectangle([x, ly+5, x+30, ly+11], fill=color)
    draw.text((x+38, ly-1), label, font=f_tiny, fill=TEXT_DIM)

img.save(OUT, "PNG", dpi=(150, 150))
print(f"Saved: {OUT} ({W}x{H})")
