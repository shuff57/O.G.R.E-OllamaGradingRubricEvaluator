"""
gen-handwriting-images.py
=========================
Generates synthetic handwritten statistics student response images for:
  1. Vision fine-tuning training data  → finetune-grading-vision.jsonl
  2. Post-training benchmark testing   → image-benchmark-cases.json

Each image shows a student's handwritten stats work at one of three quality levels:
  good   — clean, neat handwriting. easy to read.
  medium — normal student handwriting. some wobble, generally readable.
  bad    — messy. significant jitter, compression, harder to decipher.

Transcription fidelity:
  good + medium → exact (training output matches the rendered text exactly)
  bad           → decent (realistic OCR-style degradation: dropped decimals,
                          misread chars — mirrors what a model would produce
                          from messy handwriting)

Run locally:  pip install Pillow fonttools requests  →  python gen-handwriting-images.py
Run in Colab: just paste cells into Colab — %%markers are cell boundaries.

Outputs (all relative to the working directory):
  handwriting-images/        24 PNG files (8 responses × 3 quality levels)
  finetune-grading-vision.jsonl   24 vision training entries (base64 images)
  image-benchmark-cases.json      benchmark metadata for post-training eval
"""

# ============================================================
# CELL 1 — Install dependencies
# ============================================================
# %%
import subprocess, sys

subprocess.run(
    [sys.executable, "-m", "pip", "install", "Pillow", "fonttools", "requests", "-q"],
    check=True,
)
print("Dependencies installed.")


# ============================================================
# CELL 2 — Download handwriting fonts
# ============================================================
# %%
import os, requests as req

os.makedirs("fonts", exist_ok=True)

FONT_URLS = {
    # Caveat is a variable-weight font — PIL handles it fine with truetype()
    "Caveat[wght].ttf": (
        "https://raw.githubusercontent.com/google/fonts/main"
        "/ofl/caveat/Caveat%5Bwght%5D.ttf"
    ),
    "Kalam-Regular.ttf": (
        "https://raw.githubusercontent.com/google/fonts/main"
        "/ofl/kalam/Kalam-Regular.ttf"
    ),
}

for fname, url in FONT_URLS.items():
    fpath = f"fonts/{fname}"
    if not os.path.exists(fpath):
        print(f"Downloading {fname}...")
        r = req.get(url, timeout=30)
        r.raise_for_status()
        with open(fpath, "wb") as f:
            f.write(r.content)
        print(f"  Saved {fpath} ({len(r.content) // 1024} KB)")
    else:
        print(f"  Already exists: {fpath}")

print("Fonts ready.")


# ============================================================
# CELL 3 — Rendering utilities
# ============================================================
# %%
import random, math, base64, io, json, re
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ── Character substitutions ───────────────────────────────────────────────────
# Both fonts (Caveat, Kalam) cover Latin-1 only. Greek, math symbols, and
# Unicode subscripts require substitution.  We substitute BEFORE rendering so
# the image shows what a real student would write with a pen.
#
# Important: the stored transcription records what IS in the image, not the
# ideal LaTeX. This trains the model to transcribe accurately, then grade.

_SUBS = str.maketrans(
    {
        "μ": "u",
        "σ": "s",
        "α": "a",
        "β": "b",
        "≠": "!=",
        "≤": "<=",
        "≥": ">=",
        "√": "sqrt",
        "₀": "0",
        "₁": "1",
        "₂": "2",
        "≈": "~=",
        "±": "+/-",
        "×": "x",
        "→": "->",
        "✓": "ok",
        "→": "->",
        "∑": "sum",
        "∫": "int",
        "∞": "inf",
    }
)
_MULTI_SUBS = [  # multi-char sequences first
    ("p̂", "p^"),
    ("x̄", "x-bar"),
    ("d̄", "d-bar"),
    ("ȳ", "y-bar"),
    ("χ²", "chi^2"),
    ("Φ", "Phi"),
]


def to_render_text(text: str) -> str:
    """Convert Unicode math/Greek to ASCII approximations for rendering."""
    for src, dst in _MULTI_SUBS:
        text = text.replace(src, dst)
    return text.translate(_SUBS)


def degrade_transcription(text: str, seed: int = 0) -> str:
    """
    Apply realistic OCR-like errors to simulate a model reading messy handwriting.
    Called only for 'bad' quality images.
    """
    rng = random.Random(seed)

    # Occasional decimal drop  (e.g. 2.381 → 2381 or 238)
    def maybe_drop_decimal(m):
        return m.group(0).replace(".", "") if rng.random() < 0.25 else m.group(0)

    text = re.sub(r"\d+\.\d+", maybe_drop_decimal, text)
    # Occasional sign flip (rare)
    if rng.random() < 0.15:
        text = text.replace("-2.", "2.", 1)
    # Occasional word dropped (last word of a line)
    lines = text.split("\n")
    for i in range(len(lines)):
        if rng.random() < 0.12 and len(lines[i].split()) > 3:
            words = lines[i].split()
            lines[i] = " ".join(words[:-1])
    return "\n".join(lines)


# ── Quality presets ───────────────────────────────────────────────────────────
QUALITY = {
    "good": dict(
        font_size=34,
        size_jitter=0,
        x_jitter=0.5,
        y_jitter=0.5,
        rotation=0.6,
        blur=0.0,
        noise=2,
        ink_range=8,
        spacing_jitter=1,
    ),
    "medium": dict(
        font_size=32,
        size_jitter=1,
        x_jitter=2.0,
        y_jitter=1.5,
        rotation=1.5,
        blur=0.3,
        noise=5,
        ink_range=25,
        spacing_jitter=3,
    ),
    "bad": dict(
        font_size=30,
        size_jitter=3,
        x_jitter=5.0,
        y_jitter=4.0,
        rotation=3.0,
        blur=0.6,
        noise=9,
        ink_range=45,
        spacing_jitter=6,
    ),
}


def render_handwriting(
    text: str,
    quality: str,
    font_path: str,
    seed: int = 42,
) -> Image.Image:
    """
    Render text as a synthetic handwritten PNG image.

    Args:
        text:      Multi-line ASCII text (already substituted).
        quality:   "good" | "medium" | "bad"
        font_path: Path to .ttf file.
        seed:      RNG seed for reproducibility.
    Returns:
        PIL Image (RGB).
    """
    rng = random.Random(seed)
    p = QUALITY[quality]

    lines = text.split("\n")
    font_size = p["font_size"]
    line_height = font_size + 14

    W = 860
    H = max(120, len(lines) * line_height + 55)

    # Cream/off-white paper background
    paper = (
        rng.randint(249, 255),
        rng.randint(246, 254),
        rng.randint(232, 248),
    )
    img = Image.new("RGB", (W, H), paper)

    # Paper grain (subtle texture)
    if p["noise"] > 0:
        grain = np.random.RandomState(seed).normal(0, p["noise"], (H, W, 3))
        arr = np.clip(
            np.array(img, dtype=np.int16) + grain.astype(np.int16), 0, 255
        ).astype(np.uint8)
        img = Image.fromarray(arr)

    draw = ImageDraw.Draw(img)

    for line_idx, line in enumerate(lines):
        if not line.strip():
            continue

        fsize = max(22, font_size + rng.randint(-p["size_jitter"], p["size_jitter"]))
        try:
            font = ImageFont.truetype(font_path, fsize)
        except Exception:
            font = ImageFont.load_default()

        y_base = 22 + line_idx * (
            line_height + rng.randint(-p["spacing_jitter"], p["spacing_jitter"])
        )
        x = 22 + rng.randint(-4, 4)

        for ch in line:
            # Ink color: dark blue-black with per-character variation
            ir = rng.randint(0, max(1, p["ink_range"] // 5))
            ig = rng.randint(0, max(1, p["ink_range"] // 5))
            ib = rng.randint(35, min(100, 35 + p["ink_range"]))

            jx = rng.uniform(-p["x_jitter"], p["x_jitter"])
            jy = rng.uniform(-p["y_jitter"], p["y_jitter"])

            draw.text((x + jx, y_base + jy), ch, font=font, fill=(ir, ig, ib))

            try:
                bbox = font.getbbox(ch)
                cw = bbox[2] - bbox[0]
            except Exception:
                cw = fsize // 2

            # Occasional character compression for 'bad' quality
            compress = 0.78 if (quality == "bad" and rng.random() < 0.25) else 1.0
            x += cw * compress + rng.randint(-1, 1)

    # Whole-image rotation (simulate paper tilt or shaky hand)
    angle = rng.uniform(-p["rotation"], p["rotation"])
    img = img.rotate(angle, fillcolor=paper, expand=False)

    # Mild Gaussian blur (pen ink spread / photo blur)
    if p["blur"] > 0 and rng.random() < 0.65:
        img = img.filter(ImageFilter.GaussianBlur(radius=p["blur"]))

    return img


def img_to_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


print("Rendering utilities ready.")


# ============================================================
# CELL 4 — Student responses & rubrics
# ============================================================
# %%

SYSTEM = (
    "You are an expert grading assistant. "
    "If the student's work is provided as an image, transcribe it verbatim before grading. "
    "Then grade against the provided rubric. Output: JSON object only."
)

PHILOSOPHY = """\
Grade each response against the rubric criteria provided:
- Award credit proportional to how thoroughly each rubric criterion is met, not response length
- Evaluate what the student demonstrated, not what they omitted
- Use the full scoring range (0-10) as defined by the scoring anchors -- do not compress toward the middle
- Off-topic, empty, or nonsensical responses receive a score of 0
- Instructor custom instructions (if any) take absolute precedence over this base philosophy"""

PARTIAL_CREDIT = (
    "PARTIAL CREDIT RULE: When a criterion is addressed conceptually but lacks specific values, "
    "formulas, or concrete evidence, award 40-60% of that criterion's points. "
    "Award 20-40% if only loosely related; 60-80% if substantially complete but missing one key element."
)

SCORING_SCALE = """\
0: No submission or completely blank
1: Off-topic: response does not address the question at all
2: Minimal effort: mentions the topic but shows almost no understanding
3: Very limited: some awareness of concepts but largely incomplete
4: Partial: shows basic familiarity but misses most key criteria
5: Developing: demonstrates partial understanding, covers some key points
6: Approaching: addresses main ideas but with notable gaps or errors
7: Competent: addresses most rubric criteria adequately
8: Proficient: correctly addresses all rubric criteria
9: Strong: thorough and accurate with clear explanation
10: Excellent: comprehensive, precise, and clearly communicated"""

RESPONSE_FORMAT = (
    "Return ONLY valid JSON. No markdown code fences. No explanation text.\n"
    '{"transcription": "<student\'s response verbatim>", "score": <0-10>}'
)


def build_rubric_prompt(rubric: dict) -> str:
    """Build the grading prompt for an image-input entry.
    STUDENT WORK section is empty — the model reads it from the image."""
    p = f"GRADING PHILOSOPHY:\n{PHILOSOPHY}\n\nMAX SCORE: 10\n\nQUESTION/PROMPT:\n{rubric['question']}\n"
    if rubric.get("checklist"):
        p += "\nGRADING CHECKLIST:\n"
        for item in rubric["checklist"]:
            p += f"- {item}\n"
        p += f"\n{PARTIAL_CREDIT}\n"
    if rubric.get("steps"):
        p += f"\nEXPECTED SOLUTION STEPS:\n{rubric['steps']}\n"
        p += f"\n{PARTIAL_CREDIT}\n"
    p += f"\nSCORING SCALE:\n{SCORING_SCALE}\n\nSTUDENT WORK:\n[see image above]\n\nRESPONSE FORMAT:\n{RESPONSE_FORMAT}"
    return p


# ── Rubrics ───────────────────────────────────────────────────────────────────

R_T_TEST = {
    "question": (
        "A professor claims her students study an average of u0 = 20 hours per week. "
        "A random sample of 16 students reports x-bar = 17.5 hours, s = 4.2 hours. "
        "Conduct a two-tailed t-test at a = 0.05. "
        "State hypotheses, calculate t, state df, and write a conclusion."
    ),
    "checklist": [
        "Hypotheses (2 pts): H0: u=20; H1: u!=20",
        "Test Statistic (4 pts): t=(17.5-20)/(4.2/sqrt(16))=-2.38; df=15",
        "Conclusion (4 pts): |t|=2.38 > t*(15)~=2.131 -> reject H0",
    ],
}

R_Z_SCORE = {
    "question": (
        "Exam scores are normally distributed with mean u = 70 and standard deviation s = 8. "
        "Find P(X > 78). Show all steps."
    ),
    "steps": (
        "Step 1: z=(78-70)/8=1.00\n"
        "Step 2: Phi(1.00)=0.8413\n"
        "Step 3: P(X>78)=1-0.8413=0.1587"
    ),
}

R_CONF_INT = {
    "question": (
        "A random sample of 200 registered voters found that 118 plan to vote for Candidate A. "
        "Construct a 95% confidence interval for the true proportion. "
        "Check conditions, show work, and interpret."
    ),
    "checklist": [
        "Conditions (2 pts): np^=118>=10, n(1-p^)=82>=10, random, independence",
        "Calculation (4 pts): p^=0.59, SE~=0.0348, CI=(0.522, 0.658)",
        "Interpretation (4 pts): 95% confident true proportion is between 52.2% and 65.8%",
    ],
}

R_BINOMIAL = {
    "question": (
        "A basketball player makes 70% of her free throws. "
        "In a game she takes 8 free throws. Calculate P(X=5) using the binomial formula. "
        "Verify all four binomial conditions are met."
    ),
    "checklist": [
        "Conditions (3 pts): fixed n=8, binary outcome, independent trials, constant p=0.70",
        "Calculation (4 pts): P(X=5)=C(8,5)(0.70)^5(0.30)^3=56x0.168x0.027~=0.254",
        "Interpretation (3 pts): about 25.4% probability she makes exactly 5 of 8",
    ],
}

R_EXPER_DESIGN = {
    "question": (
        "Researchers test a new study app by letting students CHOOSE whether to use it, "
        "then compare exam scores. Identify whether this is an experiment or observational "
        "study. Name a confounding variable. Explain how random assignment would improve it."
    ),
    "checklist": [
        "Study Type (3 pts): observational study (self-selection, no random assignment)",
        "Confounding Variable (3 pts): motivation — affects both app use and exam scores",
        "Random Assignment (4 pts): would distribute confounders equally; isolates app effect",
    ],
}

R_BASIC_PROB = {
    "question": (
        "A box has 10 marbles: 4 red, 3 blue, 3 green. Find P(not red) using complement. "
        "Then from another box with 6 red and 4 blue, draw two WITHOUT replacement and "
        "find P(both red). Explain the rule used and why those events are dependent."
    ),
    "checklist": [
        "Complement Rule (3 pts): P(not red)=1-P(red)=1-4/10=6/10=0.60; states P(A^c)=1-P(A)",
        "General Multiplication Rule (4 pts): P(both red)=(6/10)(5/9)=30/90=1/3~=0.333",
        "Why Dependent (3 pts): without replacement changes counts, so 2nd draw depends on 1st",
    ],
}

R_COND_PROB = {
    "question": (
        "A disease has 1% prevalence. Test sensitivity is 90% and specificity is 85%. "
        "Using a 10,000-person setup, find P(disease | positive test). "
        "Show setup, calculation, and interpretation."
    ),
    "checklist": [
        "Setup (3 pts): from 10,000 -> diseased=100, healthy=9900, TP=90, FP=1485",
        "Calculation (4 pts): P(disease|+)=90/(90+1485)=90/1575~=5.7%",
        "Interpretation (3 pts): low posterior chance despite positive due to low base rate",
    ],
}

R_RANDOM_VAR = {
    "question": (
        "A carnival game costs $3. Net outcomes: -$2 with P=3/5, +$2 with P=1/5, +$7 with P=1/5. "
        "Find E[X], Var(X), and SD(X). Based on E[X], should a rational player play?"
    ),
    "checklist": [
        "Probability Distribution (2 pts): X=-2 (3/5), X=+2 (1/5), X=+7 (1/5); probs sum to 1",
        "E[X] Calculation (3 pts): E[X]=(-2)(3/5)+(2)(1/5)+(7)(1/5)=0.60",
        "Var(X) and SD(X) (3 pts): Var=12.64, SD=sqrt(12.64)~=3.56",
        "Decision (2 pts): E[X]>0 so yes in long run",
    ],
}

R_GEOMETRIC = {
    "question": (
        "A free-throw shooter makes 75% of attempts. "
        "She shoots until first success. X = number of shots needed. "
        "State the 4 geometric conditions. Calculate P(X=3). Find E[X] and interpret."
    ),
    "checklist": [
        "Geometric Conditions (4 pts): binary (make/miss), independent shots, constant p=0.75, no fixed n",
        "P(X=3) (3 pts): P(X=k)=(1-p)^(k-1)*p; P(X=3)=(0.25)^2*0.75=0.0469",
        "E[X] (3 pts): E[X]=1/p=1/0.75~=1.33 shots on average",
    ],
}

R_NORM_APPROX = {
    "question": (
        "In a class of 120 students, pass rate is 65%. X = number who pass. "
        "Verify success-failure. Find μ and σ. Use normal approximation with "
        "continuity correction to estimate P(X ≥ 85)."
    ),
    "checklist": [
        "Success-Failure (2 pts): np=78>=10 and n(1-p)=42>=10",
        "Mean and SD (3 pts): μ=np=78, σ=sqrt(npq)=sqrt(27.3)~=5.225",
        "Continuity and P (5 pts): P(X>=85)~=P(Y>=84.5), z=6.5/5.225~=1.245, P~=0.107",
    ],
}

R_CLT = {
    "question": (
        "Homework times are normal with μ=90 min and σ=25 min. "
        "For random sample n=25, describe sampling distribution of x̄ "
        "(shape, mean, SE). Then find P(x̄ > 96)."
    ),
    "checklist": [
        "Shape and Justification (2 pts): sampling distribution is normal because population is normal",
        "Mean and SE (4 pts): μ_x̄=90 and SE=σ/sqrt(n)=25/sqrt(25)=5",
        "Probability (4 pts): z=(96-90)/5=1.20 and P(x̄>96)=1-0.8849=0.1151",
    ],
}

R_ONE_PROP_Z = {
    "question": (
        "A poll surveys 100 voters; 54 support Proposition A. "
        "Test H0: p = 0.50 vs H1: p > 0.50 at a = 0.05. Show all steps."
    ),
    "steps": (
        "Step 1: p^ = 54/100 = 0.54\n"
        "Step 2: SE0 = sqrt(0.50x0.50/100) = 0.05\n"
        "Step 3: z = (0.54 - 0.50)/0.05 = 0.80\n"
        "Step 4: p-value = P(z > 0.80) = 1 - 0.7881 = 0.2119\n"
        "Step 5: 0.2119 > 0.05 -> fail to reject H0"
    ),
}

R_TWO_PROP_Z = {
    "question": (
        "Group 1 (n=100) has 40 successes; Group 2 (n=100) has 55 successes. "
        "Test H0: p1 = p2 vs H1: p1 != p2 at a = 0.05. Show all steps."
    ),
    "steps": (
        "Step 1: p1^ = 40/100 = 0.40, p2^ = 55/100 = 0.55\n"
        "Step 2: pooled p^ = (40+55)/(100+100) = 0.475\n"
        "Step 3: SE = sqrt(0.475x0.525/100 + 0.475x0.525/100) = 0.0706\n"
        "Step 4: z = (0.40 - 0.55)/0.0706 = -2.12\n"
        "Step 5: two-tail p ~= 0.034 < 0.05 -> reject H0"
    ),
}

R_CHI_GOF = {
    "question": (
        "60 people taste 4 ice cream flavors. Observed counts: Vanilla=12, "
        "Chocolate=18, Strawberry=14, Mint=16. Test whether flavors are equally "
        "preferred using chi-square GOF at a=0.05. Show all steps."
    ),
    "checklist": [
        "Hypotheses (2 pts): H0 all flavors equally preferred; H1 at least one differs",
        "Expected counts (3 pts): E=60/4=15 each; all expected counts >=5",
        "Chi-square statistic (3 pts): chi^2=1.333 from sum((O-E)^2/E)",
        "Decision (2 pts): df=3, critical=7.815; 1.333<7.815 fail to reject H0",
    ],
}

R_CHI_INDEP = {
    "question": (
        "Smokers (n=100): 70 with disease, 30 without. Non-smokers (n=200): "
        "80 with disease, 120 without. Test independence at a=0.05."
    ),
    "checklist": [
        "Hypotheses (2 pts): H0 smoking and disease are independent; H1 not independent",
        "Expected counts (3 pts): E(S,D)=50, E(S,ND)=50, E(NS,D)=100, E(NS,ND)=100",
        "Chi-square statistic (3 pts): chi^2=24 from sum((O-E)^2/E across 4 cells)",
        "Decision (2 pts): df=1, critical=3.841; 24>3.841 reject H0",
    ],
}

R_TWO_SAMPLE_T = {
    "question": (
        "Group A (n=20, x-bar=78, s=8) vs Group B (n=25, x-bar=72, s=10). "
        "Conduct a two-sample t-test at a=0.05 (one-tailed, H1: u_A > u_B)."
    ),
    "checklist": [
        "Hypotheses (2 pts): H0: uA=uB; H1: uA>uB (one-tailed; tutoring scores higher)",
        "Conditions (2 pts): random, independent samples; both groups large enough",
        "Test Statistic and df (4 pts): t=(78-72)/sqrt(64/20+100/25)=6/sqrt(7.2)~=2.24; df=min(19,24)=19",
        "Conclusion (2 pts): t*~=1.729 at df=19 one-tail; 2.24>1.729 reject H0",
    ],
}

R_PAIRED_T = {
    "question": (
        "15 runners measured before/after training. d-bar=1.2 min, s_d=0.9. "
        "Explain WHY paired (not two-sample). Test H0: u_d=0 at a=0.05."
    ),
    "checklist": [
        "Why Paired (3 pts): same runners measured twice; pairing removes between-runner variability",
        "Hypotheses (2 pts): H0: u_d=0; H1: u_d>0 (training reduces time; d=before-after)",
        "Test Statistic and df (3 pts): t=d-bar/(s_d/sqrt(n))=1.2/(0.9/sqrt(15))~=5.16; df=14",
        "Conclusion (2 pts): t*~=1.761 df=14 one-tail; 5.16>1.761 reject H0",
    ],
}

R_ANOVA = {
    "question": (
        "Compare exam scores in 3 course sections (morning/afternoon/evening). "
        "Explain what ANOVA tests, why not multiple t-tests (Type I error), "
        "what F-statistic means, and ANOVA conditions."
    ),
    "checklist": [
        "What ANOVA Tests (3 pts): tests if >=1 group mean differs; avoids Type I inflation from multiple t-tests",
        "F-statistic (3 pts): F=between-group variability/within-group variability; large F means groups differ",
        "Conditions (2 pts): independence, normality within each group, equal variances across groups",
        "Conclusion Context (2 pts): significant F=at least one section differs; need post-hoc tests to identify which",
    ],
}

R_POWER = {
    "question": (
        "Vaccine study. Explain power (= 1-b), Type II error, and 3 factors "
        "that affect power."
    ),
    "checklist": [
        "Definition (3 pts): Power=P(reject H0|H0 false)=1-beta; Type II error=failing to detect real effect",
        "Three Factors (5 pts): sample size (larger n -> more power); alpha (larger alpha -> more power); effect size (larger true difference -> more power)",
        "Why High Power Matters (2 pts): missing real vaccine effect costs lives; target power>=0.80",
    ],
}

R_REGRESSION = {
    "question": (
        "Fit y-hat=52+4.3x (hours studied vs exam score), R^2=0.61. "
        "Interpret slope, intercept, R^2. Predict for x=8. Give one limitation."
    ),
    "checklist": [
        "Slope (3 pts): +4.3 predicted points per additional hour studied on avg; includes direction+units",
        "Intercept and R^2 (3 pts): intercept 52=predicted score at 0 hrs (may lack meaning); R^2=0.61 means 61% variability explained",
        "Prediction and Limitation (4 pts): y-hat=52+4.3(8)=86.4; limitation: no causation / lurking variables / extrapolation",
    ],
}

R_OUTLIERS = {
    "question": (
        "CEO has 5 years experience, salary $850K (far above others). "
        "Define leverage vs influence. How does this point affect regression line?"
    ),
    "checklist": [
        "Leverage (3 pts): how far x-value is from mean x; CEO may be high leverage if x=5 is extreme",
        "Influence (3 pts): actual regression change when point included/excluded; measured by Cook's distance",
        "Effect on Line (4 pts): extreme y=$850K pulls slope up and inflates intercept; check same population; maybe exclude",
    ],
}

R_SLOPE_INF = {
    "question": (
        "Regression of exam score on sleep hours: b1=3.2, SE=1.1, t=2.91, "
        "p=0.007. Interpret slope, test H0:b1=0, and find 95% CI (t*=2.048, df=28)."
    ),
    "checklist": [
        "Slope Interpretation (2 pts): +3.2 predicted exam points per additional sleep hour on avg",
        "Hypotheses and Test (4 pts): H0:b1=0, H1:b1!=0; t=3.2/1.1=2.91; df=28; p=0.007<0.05 reject H0",
        "95% CI (4 pts): CI=3.2+/-2.048(1.1)=(0.95,5.45); 95% confident true slope is 0.95 to 5.45 pts/hr",
    ],
}


# ── Student responses ─────────────────────────────────────────────────────────
# 8 responses across 4 stats topics, 2 quality bands each (weak / partial / strong).
# 'text' uses Unicode for readability here — to_render_text() converts before rendering.

RESPONSES = [
    # ── t-test ──────────────────────────────────────────────────────────────
    {
        "id": "t_test_weak",
        "rubric": R_T_TEST,
        "score": 3,
        "text": (
            "The null hypothesis is that the mean equals 20.\n"
            "The z-score is (17.5-20)/4.2 = -0.595.\n"
            "Since this is between -1.96 and 1.96,\n"
            "we fail to reject the null hypothesis.\n"
            "Not enough evidence students study different."
        ),
    },
    {
        "id": "t_test_partial",
        "rubric": R_T_TEST,
        "score": 6,
        "text": (
            "H₀: μ = 20 hrs;  H₁: μ ≠ 20 hrs (two-tailed)\n"
            "t = (17.5 - 20)/(4.2/√16) = -2.38,  df = 15\n"
            "Critical value at α=0.05: t* ≈ 2.131\n"
            "Since |t| = 2.38 > 2.131, we reject H₀.\n"
            "Evidence true mean differs from 20 hrs."
        ),
    },
    {
        "id": "t_test_strong",
        "rubric": R_T_TEST,
        "score": 9,
        "text": (
            "H₀: μ=20 hrs, H₁: μ≠20 hrs (two-tailed)\n"
            "t = (17.5-20)/(4.2/√16) = -2.5/1.05 = -2.381\n"
            "df = n-1 = 15\n"
            "t* at α=0.05 two-tail df=15 is ±2.131\n"
            "|t|=2.381 > 2.131 → reject H₀ at α=0.05\n"
            "Sufficient evidence μ ≠ 20 hours/week."
        ),
    },
    # ── z-score ─────────────────────────────────────────────────────────────
    {
        "id": "z_score_wrong",
        "rubric": R_Z_SCORE,
        "score": 2,
        "text": (
            "z = (78-70)/8 = 1.00\nThe probability is 0.8413.\nSo P(X > 78) = 0.8413"
        ),
    },
    {
        "id": "z_score_partial",
        "rubric": R_Z_SCORE,
        "score": 5,
        "text": (
            "z = (78-70)/8 = 1.00\n"
            "Φ(1.00) = 0.8413\n"
            "P(X > 78) = 1 - 0.8413 = 0.1587\n"
            "About 15.87% of scores exceed 78."
        ),
    },
    {
        "id": "z_score_strong",
        "rubric": R_Z_SCORE,
        "score": 9,
        "text": (
            "Step 1: z = (78-70)/8 = 1.00\n"
            "Step 2: Φ(1.00) = 0.8413\n"
            "Step 3: P(X>78) = 1-0.8413 = 0.1587\n"
            "About 15.9% of N(70,8) scores exceed 78.\n"
            "Makes sense: z=1 is 1 SD above mean."
        ),
    },
     # ── confidence interval ──────────────────────────────────────────────────
     {
         "id": "ci_weak",
         "rubric": R_CONF_INT,
         "score": 3,
         "text": (
             "p^ = 118/200 = 0.59\n"
             "SE = sqrt(0.59/200) = 0.054  (WRONG)\n"
             "CI = 0.59 +/- 1.96(0.054)\n"
             "95% probability interval is (0.484, 0.696)"
         ),
     },
     {
         "id": "ci_partial",
         "rubric": R_CONF_INT,
         "score": 5,
         "text": (
             "p^ = 118/200 = 0.59\n"
             "np^ = 118 >= 10, n(1-p^) = 82 >= 10 ok\n"
             "SE = sqrt(0.59x0.41/200) ~= 0.035\n"
             "CI = 0.59 +/- 1.96(0.035) = (0.52, 0.66)\n"
             "95% confident the interval captures\n"
             "the true proportion."
         ),
     },
     {
         "id": "ci_strong",
         "rubric": R_CONF_INT,
         "score": 9,
         "text": (
             "Conditions: random, np^=118>=10, n(1-p^)=82>=10\n"
             "independence (200 < 10% of popn). All ok.\n"
             "p^ = 118/200 = 0.59\n"
             "SE = sqrt(0.59*0.41/200) = 0.0348\n"
             "CI = 0.59 +/- 1.96(0.035) = (0.522, 0.658)\n"
             "95% confident true proportion in (52.2%, 65.8%)"
         ),
     },
     # ── binomial ─────────────────────────────────────────────────────────────
     {
         "id": "binomial_weak",
         "rubric": R_BINOMIAL,
         "score": 3,
         "text": (
             "P(X=5) = p*n = 0.70*8 = 5.6 ?? no\n"
             "P(X=5) = 0.70^5 = 0.168\n"
             "About 16.8% probability."
         ),
     },
     {
         "id": "binomial_partial",
         "rubric": R_BINOMIAL,
         "score": 6,
         "text": (
             "Conditions: fixed n=8, make/miss binary,\n"
             "independent shots, constant p=0.70. All met.\n"
             "P(X=5) = C(8,5)(0.70)^5(0.30)^3\n"
             "= 56 x 0.168 x 0.027 ~= 0.254\n"
             "About 25% chance she makes exactly 5 of 8."
         ),
     },
     {
         "id": "binomial_strong",
         "rubric": R_BINOMIAL,
         "score": 9,
         "text": (
             "Conditions: n=8 fixed, make/miss binary,\n"
             "independent shots, p=0.70 constant. All met.\n"
             "P(X=5) = C(8,5)(0.70)^5(0.30)^3\n"
             "= 56 x 0.168 x 0.027 = 0.254\n"
             "About 25.4% she makes exactly 5 of 8."
         ),
     },
     {
         "id": "exper_design_weak",
         "rubric": R_EXPER_DESIGN,
         "score": 3,
         "text": (
             "This is an experiment (two groups compared).\n"
             "But students self-select, so confounding exists.\n"
             "Motivation could raise both app use and scores.\n"
             "Random assignment would make groups more fair."
         ),
     },
     {
         "id": "exper_design_partial",
         "rubric": R_EXPER_DESIGN,
         "score": 6,
         "text": (
             "This is observational: no random assignment.\n"
             "Students choose app use (self-selection).\n"
             "Confounder: motivation affects use and score.\n"
             "Random assignment balances motivation by chance."
         ),
     },
     {
         "id": "exper_design_strong",
         "rubric": R_EXPER_DESIGN,
         "score": 9,
         "text": (
             "Observational study, not a true experiment.\n"
             "Reason: students self-select app vs no-app.\n"
             "Confounder: motivation -> more app use,\n"
             "and independently more study + higher scores.\n"
             "Random assignment spreads confounders across\n"
             "groups, isolating app causal effect."
         ),
     },
     {
         "id": "basic_prob_weak",
         "rubric": R_BASIC_PROB,
         "score": 3,
         "text": (
             "P(not red)=1-4/10=6/10=0.60 (complement).\n"
             "For both red: (6/10)(6/10)=0.36.\n"
             "I used 0.60 twice for the two draws.\n"
             "Dependent because no replacement."
         ),
     },
     {
         "id": "basic_prob_partial",
         "rubric": R_BASIC_PROB,
         "score": 6,
         "text": (
             "Complement: P(not red)=1-P(red)=1-4/10=0.60.\n"
             "Both red: P=(6/10)(5/9)=30/90=1/3~=0.333.\n"
             "Used multiplication rule with conditional term.\n"
             "No replacement changes 2nd-draw probability."
         ),
     },
     {
         "id": "basic_prob_strong",
         "rubric": R_BASIC_PROB,
         "score": 8,
         "text": (
             "Complement rule: P(A^c)=1-P(A).\n"
             "So P(not red)=1-4/10=6/10=0.60.\n"
             "Without replacement: P(both red)=\n"
             "P(1st red)P(2nd red|1st red)\n"
             "=(6/10)(5/9)=30/90=1/3~=0.333.\n"
             "Dependent: after red first draw, box is 5/9 red."
         ),
     },
     {
         "id": "cond_prob_weak",
         "rubric": R_COND_PROB,
         "score": 2,
         "text": (
             "It is 90% because sensitivity is 90%.\n"
             "So a positive test means 90% sick."
         ),
     },
     {
         "id": "cond_prob_partial",
         "rubric": R_COND_PROB,
         "score": 5,
         "text": (
             "Use 10,000 people: diseased=100, healthy=9900.\n"
             "TP=90. FP=0.15x9900=1485.\n"
             "P(disease|+)=90/(90+1485)=90/1575=0.057.\n"
             "So about 5.7% with a positive test."
         ),
     },
     {
         "id": "cond_prob_strong",
         "rubric": R_COND_PROB,
         "score": 9,
         "text": (
             "Start with 10,000: diseased 100, healthy 9900.\n"
             "Sensitivity 90% -> TP=90, FN=10.\n"
             "Specificity 85% -> FP=1485, TN=8415.\n"
             "Total positives = 90+1485 = 1575.\n"
             "P(disease|+) = 90/1575 ~= 0.057 = 5.7%.\n"
             "Low base rate (1%) means false positives\n"
             "greatly outnumber true positives."
         ),
     },
     {
         "id": "random_var_weak",
         "rubric": R_RANDOM_VAR,
         "score": 3,
         "text": (
             "Outcomes: -2, +2, +7 with probs 3/5,1/5,1/5.\n"
             "E[X]=(-2+2+7)/3=2.33 (used plain average).\n"
             "So player should play since EV is positive."
         ),
     },
     {
         "id": "random_var_partial",
         "rubric": R_RANDOM_VAR,
         "score": 6,
         "text": (
             "P(X=-2)=3/5, P(X=2)=1/5, P(X=7)=1/5.\n"
             "E[X]=(-2)(3/5)+(2)(1/5)+(7)(1/5)=0.60.\n"
             "Var=(-2-0.6)^2(0.6)+(2-0.6)^2(0.2)\n"
             "+(7-0.6)^2(0.2)=12.64, SD=sqrt(12.64)~=3.56.\n"
             "E[X]>0, so rational player should play."
         ),
     },
     {
         "id": "random_var_strong",
         "rubric": R_RANDOM_VAR,
         "score": 9,
         "text": (
             "Distribution: X=-2 (0.60), X=2 (0.20), X=7 (0.20).\n"
             "Check probs: 0.60+0.20+0.20=1.\n"
             "E[X]=sum xP(x)=(-2)(0.60)+(2)(0.20)+(7)(0.20)\n"
             "= -1.2+0.4+1.4 = 0.60 per play.\n"
             "Var(X)=sum (x-0.6)^2P(x)=12.64.\n"
             "SD(X)=sqrt(12.64)~=3.56 dollars.\n"
             "Since E[X]>0, LLN says long-run average gain."
         ),
     },
     {
         "id": "geometric_weak",
         "rubric": R_GEOMETRIC,
         "score": 3,
         "text": (
             "X counts shots until first make.\n"
             "This is similar to binomial, repeated tries.\n"
             "I did P(X=3)=0.75^3=0.422 (three makes).\n"
             "E[X]=1/p=1/0.75=1.33 shots."
         ),
     },
     {
         "id": "geometric_partial",
         "rubric": R_GEOMETRIC,
         "score": 6,
         "text": (
             "Geometric: shots until first success.\n"
             "Conds: binary, indep, constant p, no fixed n.\n"
             "P(X=k)=(1-p)^(k-1)*p.\n"
             "P(X=3)=(0.25)^2*0.75=0.0469.\n"
             "E[X]=1/0.75=1.33 shots avg."
         ),
     },
     {
         "id": "geometric_strong",
         "rubric": R_GEOMETRIC,
         "score": 9,
         "text": (
             "X=trial of first make; geometric model.\n"
             "1) Binary: make or miss each shot.\n"
             "2) Independent shots.\n"
             "3) Constant p=0.75 every trial.\n"
             "4) No fixed n: stop at first success.\n"
             "P(X=3)=(1-0.75)^(2)*0.75=0.0469.\n"
             "E[X]=1/p=1.33, so ~1.33 shots to first make."
         ),
     },
     {
         "id": "norm_approx_weak",
         "rubric": R_NORM_APPROX,
         "score": 3,
         "text": (
             "Check: np=78 and n(1-p)=42, so approx ok.\n"
             "Mean u=np=78.\n"
             "s=sqrt(npq)=sqrt(27.3)~=5.2.\n"
             "z=(85-78)/5.2=1.35 so upper tail is small."
         ),
     },
     {
         "id": "norm_approx_partial",
         "rubric": R_NORM_APPROX,
         "score": 6,
         "text": (
             "np=78>=10 and n(1-p)=42>=10, normal is valid.\n"
             "u=np=78, s=sqrt(120*0.65*0.35)=5.225.\n"
             "Use CC: P(X>=85) ~= P(Y>=84.5).\n"
             "z=(84.5-78)/5.225=1.245.\n"
             "P(Z>=1.245)=1-0.893~=0.107."
         ),
     },
     {
         "id": "norm_approx_strong",
         "rubric": R_NORM_APPROX,
         "score": 9,
         "text": (
             "Success-failure: np=78, n(1-p)=42, both >=10.\n"
             "So normal approx to binomial is justified.\n"
             "u=np=78; s=sqrt(npq)=sqrt(27.3)=5.225.\n"
             "Continuity correction for >=85 uses 84.5.\n"
             "P(X>=85) ~= P(Y>=84.5), Y~N(78,5.225).\n"
             "z=(84.5-78)/5.225=1.245.\n"
             "P(z>=1.245)=0.107, about 10.7% pass >=85."
         ),
     },
     {
         "id": "clt_weak",
         "rubric": R_CLT,
         "score": 2,
         "text": (
             "x-bar sampling dist is normal.\n"
             "Mean is 90 and I used SE=s=25.\n"
             "z=(96-90)/25=0.24.\n"
             "P(x-bar>96) is about 0.40."
         ),
     },
     {
         "id": "clt_partial",
         "rubric": R_CLT,
         "score": 5,
         "text": (
             "Population is normal, so x-bar is normal.\n"
             "Mean of x-bar is 90; SE=25/sqrt(25)=5.\n"
             "z=(96-90)/5=1.20.\n"
             "P(x-bar>96)=P(z>1.20)=1-0.8849=0.1151."
         ),
     },
     {
         "id": "clt_strong",
         "rubric": R_CLT,
         "score": 9,
         "text": (
             "Because population is normal, x-bar is normal.\n"
             "No CLT approximation is needed here.\n"
             "Mean of x-bar: u_x-bar = 90 min.\n"
             "SE = s/sqrt(n)=25/sqrt(25)=5 min.\n"
             "z=(96-90)/5=1.20.\n"
             "P(x-bar>96)=P(z>1.20)=1-0.8849=0.1151.\n"
             "So chance sample mean exceeds 96 is 11.5%."
         ),
     },
     {
         "id": "one_prop_z_weak",
         "rubric": R_ONE_PROP_Z,
         "score": 2,
         "text": (
             "H0 and H1 were not written.\n"
             "p^=54/100=0.54, SE0=sqrt(0.5x0.5/100)=0.05.\n"
             "z=(0.54-0.50)/0.05=0.80.\n"
             "p-value=0.7881 so reject H0."
         ),
     },
     {
         "id": "one_prop_z_partial",
         "rubric": R_ONE_PROP_Z,
         "score": 6,
         "text": (
             "H0:p=0.50, H1:p>0.50.\n"
             "p^=54/100=0.54.\n"
             "SE0=sqrt(0.50x0.50/100)=0.05.\n"
             "z=(0.54-0.50)/0.05=0.80, p=0.212.\n"
             "0.212>0.05 so fail to reject H0."
         ),
     },
     {
         "id": "one_prop_z_strong",
         "rubric": R_ONE_PROP_Z,
         "score": 9,
         "text": (
             "Step1 H0:p=0.50, H1:p>0.50.\n"
             "Step2 p^=54/100=0.54.\n"
             "Step3 SE0=sqrt(0.5x0.5/100)=0.05.\n"
             "Step4 z=(0.54-0.50)/0.05=0.80.\n"
             "Step5 p=1-Phi(0.80)=1-0.7881=0.2119.\n"
             "Step6 0.212>0.05 -> fail to reject H0.\n"
             "Data do not show majority support for Prop A."
         ),
     },
     {
         "id": "two_prop_z_weak",
         "rubric": R_TWO_PROP_Z,
         "score": 3,
         "text": (
             "p1^=0.40, p2^=0.55.\n"
             "SE=sqrt(0.40x0.60/100+0.55x0.45/100)=0.070.\n"
             "z=(0.40-0.55)/0.070=-2.15.\n"
             "No pooled p^ used; hypotheses missing."
         ),
     },
     {
         "id": "two_prop_z_partial",
         "rubric": R_TWO_PROP_Z,
         "score": 6,
         "text": (
             "H0:p1=p2, H1:p1!=p2.\n"
             "p1^=0.40, p2^=0.55, pooled p^=0.475.\n"
             "SE=sqrt(0.475x0.525/100+0.475x0.525/100)\n"
             "=0.0706, z=(0.40-0.55)/0.0706=-2.12.\n"
             "two-tail p=0.034<0.05, reject H0."
         ),
     },
     {
         "id": "two_prop_z_strong",
         "rubric": R_TWO_PROP_Z,
         "score": 9,
         "text": (
             "Step1 H0:p1=p2, H1:p1!=p2.\n"
             "Step2 p1^=40/100=0.40, p2^=55/100=0.55.\n"
             "Step3 pooled p^=(40+55)/200=0.475.\n"
             "Step4 SE=sqrt(0.475x0.525/100+0.475x0.525/100)\n"
             "=0.0706.\n"
             "Step5 z=(0.40-0.55)/0.0706=-2.124.\n"
             "Step6 p=0.034<0.05 -> reject H0.\n"
             "Groups differ in success rates."
         ),
     },
     {
         "id": "chi_gof_weak",
         "rubric": R_CHI_GOF,
         "score": 3,
         "text": (
             "Expected counts are E=60/4=15 each.\n"
             "chi^2=1.333 from sum((O-E)^2/E).\n"
             "I used df=4 and critical 9.488 (wrong).\n"
             "So I fail to reject H0."
         ),
     },
     {
         "id": "chi_gof_partial",
         "rubric": R_CHI_GOF,
         "score": 6,
         "text": (
             "H0: all 4 flavor probs are equal.\n"
             "H1: at least one flavor prob differs.\n"
             "Expected counts: E=15 each.\n"
             "chi^2=1.333, df=3.\n"
             "1.333<7.815 so fail to reject H0."
         ),
     },
     {
         "id": "chi_gof_strong",
         "rubric": R_CHI_GOF,
         "score": 9,
         "text": (
             "H0: pV=pC=pS=pM=0.25; H1: not all equal.\n"
             "E values: 60/4=15,15,15,15.\n"
             "chi^2=(12-15)^2/15+(18-15)^2/15\n"
             "+(14-15)^2/15+(16-15)^2/15=1.333.\n"
             "df=k-1=4-1=3.\n"
             "critical chi^2(3,0.05)=7.815, so 1.333<7.815.\n"
             "Fail to reject: prefs look roughly equal."
         ),
     },
     {
         "id": "chi_indep_weak",
         "rubric": R_CHI_INDEP,
         "score": 3,
         "text": (
             "E(smoker,disease)=100x150/300=50.\n"
             "chi^2 using one cell: (70-50)^2/50=8.\n"
             "I used df=2 (wrong).\n"
             "Conclusion uncertain from my work."
         ),
     },
     {
         "id": "chi_indep_partial",
         "rubric": R_CHI_INDEP,
         "score": 6,
         "text": (
             "H0: smoking and disease are independent.\n"
             "H1: smoking and disease are not independent.\n"
             "Expected: 50, 50, 100, 100.\n"
             "chi^2=8+8+4+4=24.\n"
             "df=(2-1)(2-1)=1, critical=3.841.\n"
             "24>3.841 so reject H0."
         ),
     },
    {
        "id": "chi_indep_strong",
        "rubric": R_CHI_INDEP,
        "score": 9,
         "text": (
             "Step1 H0: smoking indep disease; H1: associated.\n"
             "Step2 Totals: row 100,200; col 150,150; N=300.\n"
             "Step3 Expected: E11=50, E12=50.\n"
             "E21=100, E22=100.\n"
             "Step4 chi^2=(70-50)^2/50+(30-50)^2/50\n"
             "+(80-100)^2/100+(120-100)^2/100=24.\n"
             "Step5 df=(2-1)(2-1)=1, crit=3.841.\n"
             "Step6 24>3.841 -> reject H0; not independent.\n"
            "Smoking status is linked to disease in sample."
        ),
    },
    {
        "id": "two_sample_t_weak",
        "rubric": R_TWO_SAMPLE_T,
        "score": 3,
        "text": (
            "H0: uA=uB. H1 maybe uA!=uB.\n"
            "Used pooled SD avg=9 so t=(78-72)/9=0.67.\n"
            "Compared to t*=1.729, 0.67<1.729.\n"
            "Fail reject H0; no evidence A>B."
        ),
    },
    {
        "id": "two_sample_t_partial",
        "rubric": R_TWO_SAMPLE_T,
        "score": 6,
        "text": (
            "H0:uA=uB, H1:uA>uB (one-tail).\n"
            "t=(78-72)/sqrt(64/20+100/25)\n"
            "=6/sqrt(7.2)=2.24.\n"
            "df=min(19,24)=19, t*=1.729.\n"
            "2.24>1.729 -> reject H0, A mean higher."
        ),
    },
    {
        "id": "two_sample_t_strong",
        "rubric": R_TWO_SAMPLE_T,
        "score": 9,
        "text": (
            "H0:uA=uB vs H1:uA>uB (tutoring higher).\n"
            "Cond: random indep groups; n=20,25 large ok.\n"
            "SE=sqrt(8^2/20+10^2/25)=sqrt(7.2).\n"
            "t=(78-72)/SE=6/sqrt(7.2)=2.24.\n"
            "Use conservative df=min(19,24)=19.\n"
            "t*=1.729 at a=0.05 one-tail.\n"
            "2.24>1.729 -> reject H0; Group A higher."
        ),
    },
    {
        "id": "paired_t_weak",
        "rubric": R_PAIRED_T,
        "score": 3,
        "text": (
            "Treated before/after as 2 independent samples.\n"
            "Did two-sample idea, not paired differences.\n"
            "t=d-bar/sd=1.2/0.9=1.33.\n"
            "Without pairing reason, fail reject H0."
        ),
    },
    {
        "id": "paired_t_partial",
        "rubric": R_PAIRED_T,
        "score": 6,
        "text": (
            "Paired b/c same runners measured twice.\n"
            "Each runner is own control.\n"
            "H0: u_d=0, H1: u_d>0 where d=before-after.\n"
            "t=1.2/(0.9/sqrt(15))=5.16, df=14.\n"
            "t*=1.761, so reject H0; training helps."
        ),
    },
    {
        "id": "paired_t_strong",
        "rubric": R_PAIRED_T,
        "score": 9,
        "text": (
            "Use paired t: same runners pre/post training.\n"
            "Pairing removes between-runner variability.\n"
            "Each runner serves as own control.\n"
            "H0:u_d=0 vs H1:u_d>0, d=before-after.\n"
            "t=d-bar/(sd/sqrt(n))=1.2/(0.9/sqrt(15))=5.16.\n"
            "df=14, t*=1.761 at a=0.05 one-tail.\n"
            "5.16>1.761 -> reject H0; mean time reduced."
        ),
    },
    {
        "id": "anova_weak",
        "rubric": R_ANOVA,
        "score": 3,
        "text": (
            "ANOVA F tests if groups are different.\n"
            "Kind of like a t-test but for 3 sections.\n"
            "Need normal and independent data.\n"
            "Big F means maybe reject, then groups differ."
        ),
    },
    {
        "id": "anova_partial",
        "rubric": R_ANOVA,
        "score": 6,
        "text": (
            "ANOVA tests whether >=1 section mean differs.\n"
            "It avoids Type I inflation from many t-tests.\n"
            "F=between-group variance/within-group variance.\n"
            "Conds: independence, normal each group, equal var.\n"
            "Sig F => at least one differs; do post-hoc tests."
        ),
    },
    {
        "id": "anova_strong",
        "rubric": R_ANOVA,
        "score": 9,
        "text": (
            "ANOVA compares 3 means with one overall F test.\n"
            "Doing 3 t-tests inflates Type I: \n"
            "1-(0.95)^3 ~= 0.143 chance false positive.\n"
            "F=MSG/MSE = between-group / within-group.\n"
            "Large F means section means differ vs noise.\n"
            "Conds: indep, normal in groups, equal variances.\n"
            "Sig F => >=1 differs; post-hoc finds which pair."
        ),
    },
    {
        "id": "power_weak",
        "rubric": R_POWER,
        "score": 3,
        "text": (
            "Power is tied to Type II error (missed effect).\n"
            "Power=1-b, higher power means fewer misses.\n"
            "Increase power with bigger n or smaller a.\n"
            "That is why choose very low alpha."
        ),
    },
    {
        "id": "power_partial",
        "rubric": R_POWER,
        "score": 6,
        "text": (
            "Power=P(reject H0 | H0 false)=1-b.\n"
            "Type II error: miss a real vaccine effect.\n"
            "Power up with larger n.\n"
            "Power up with larger a and larger effect size.\n"
            "High power matters in medicine; target >=0.80."
        ),
    },
    {
        "id": "power_strong",
        "rubric": R_POWER,
        "score": 9,
        "text": (
            "Power=1-b=P(reject H0 when false H0).\n"
            "Type II error (b): failing to detect real effect.\n"
            "Vaccine benefit can exist, but test may miss it.\n"
            "Larger n -> smaller SE -> more power.\n"
            "Larger a -> easier reject H0 -> more power.\n"
            "Larger effect size -> more separation -> power.\n"
            "Target power >=0.80 to avoid missing benefits."
        ),
    },
    {
        "id": "regression_weak",
        "rubric": R_REGRESSION,
        "score": 3,
        "text": (
            "Slope 4.3 means more study gives higher score.\n"
            "R^2=0.61 means model is 61% accurate.\n"
            "y-hat=52+4.3(8)=86.4.\n"
            "Limit: students differ a lot."
        ),
    },
    {
        "id": "regression_partial",
        "rubric": R_REGRESSION,
        "score": 6,
        "text": (
            "Each extra hour predicts +4.3 exam points avg.\n"
            "Intercept 52 = predicted score at 0 hours.\n"
            "R^2=0.61 => 61% score variation explained.\n"
            "y-hat=52+4.3(8)=86.4.\n"
            "Limitation: correlation, not causation."
        ),
    },
    {
        "id": "regression_strong",
        "rubric": R_REGRESSION,
        "score": 9,
        "text": (
            "Slope: +4.3 predicted points per extra hour.\n"
            "Units: exam points per hour studied, avg trend.\n"
            "Intercept 52 at x=0 hrs; may be outside data.\n"
            "R^2=0.61 means 61% variation explained by x.\n"
            "y-hat=52+4.3(8)=86.4 predicted score.\n"
            "Limitation: lurking vars; model not causal."
        ),
    },
    {
        "id": "outliers_weak",
        "rubric": R_OUTLIERS,
        "score": 4,
        "text": (
            "Leverage and influence both mean outlier point.\n"
            "CEO is far off so it is high leverage/influence.\n"
            "This point makes slope steeper and line go up.\n"
            "Probably remove it since very unusual."
        ),
    },
    {
        "id": "outliers_partial",
        "rubric": R_OUTLIERS,
        "score": 7,
        "text": (
            "Leverage: x far from x-bar (extreme x position).\n"
            "Influence: changes fit if removed; use Cook D.\n"
            "CEO y=$850K is extreme and pulls line upward.\n"
            "Slope and intercept both get inflated.\n"
            "Check if CEO is same population first."
        ),
    },
    {
        "id": "outliers_strong",
        "rubric": R_OUTLIERS,
        "score": 8,
        "text": (
            "Leverage = distance of x from x-bar.\n"
            "If most workers have higher x, CEO at x=5 is far.\n"
            "Influence = actual fit change; measured by Cook D.\n"
            "CEO y=$850K pulls line up; slope/intercept rise.\n"
            "Model then overpredicts typical salaries.\n"
            "Investigate group; maybe separate exec model."
        ),
    },
    {
        "id": "slope_inf_weak",
        "rubric": R_SLOPE_INF,
        "score": 3,
        "text": (
            "H0:b1=0 and p=0.007 so reject H0 at 0.05.\n"
            "Sleep significantly predicts exam scores.\n"
            "t=2.91 from output supports this result."
        ),
    },
    {
        "id": "slope_inf_partial",
        "rubric": R_SLOPE_INF,
        "score": 6,
        "text": (
            "Slope: +3.2 predicted points per sleep hour avg.\n"
            "H0:b1=0 vs H1:b1!=0.\n"
            "t=3.2/1.1=2.91, df=28, p=0.007<0.05 reject H0.\n"
            "95% CI: 3.2+/-2.048(1.1)=(0.95,5.45).\n"
            "True slope likely 0.95 to 5.45 pts/hr."
        ),
    },
    {
        "id": "slope_inf_strong",
        "rubric": R_SLOPE_INF,
        "score": 9,
        "text": (
            "Slope: each +1 sleep hour predicts +3.2 exam pts.\n"
            "H0:b1=0 (no linear prediction), H1:b1!=0.\n"
            "Verify t=3.2/1.1=2.91, df=30-2=28.\n"
            "p=0.007<0.05 so reject H0.\n"
            "95% CI: 3.2+/-2.048(1.1)=(0.95,5.45).\n"
            "95% conf true slope is 0.95 to 5.45 pts/hr."
        ),
    },
]

# Validate response text constraints
for resp in RESPONSES:
    lines = to_render_text(resp["text"]).split("\n")
    for i, line in enumerate(lines):
        assert len(line) <= 50, f"{resp['id']} line {i+1} is {len(line)} chars: '{line[:60]}'"
    assert len(lines) <= 10, f"{resp['id']} has {len(lines)} lines (max 10)"
print(f"All {len(RESPONSES)} responses pass length validation.")

QUALITIES = ["good", "medium", "bad"]
FONTS = ["Caveat-Regular.ttf", "Kalam-Regular.ttf"]  # alternate for visual variety

n_images = len(RESPONSES) * len(QUALITIES)
print(
    f"{len(RESPONSES)} responses x {len(QUALITIES)} quality levels = {n_images} images"
)


# ============================================================
# CELL 5 — Generate all images
# ============================================================
# %%

os.makedirs("handwriting-images", exist_ok=True)

generated = []  # accumulates metadata for each image

for r_idx, resp in enumerate(RESPONSES):
    render_text = to_render_text(resp["text"])  # ASCII-safe

    for q_idx, quality in enumerate(QUALITIES):
        font_file = FONTS[(r_idx + q_idx) % len(FONTS)]
        font_path = f"fonts/{font_file}"
        seed = r_idx * 100 + q_idx

        img = render_handwriting(render_text, quality, font_path, seed=seed)

        img_id = f"{r_idx + 1:02d}_{resp['id']}_{quality}"
        img_path = f"handwriting-images/{img_id}.png"
        img.save(img_path, "PNG", optimize=True)

        exact_transcription = render_text  # what IS in the image
        decent_transcription = degrade_transcription(render_text, seed=seed)

        # Training target: exact for good/medium, decent for bad
        training_transcription = (
            exact_transcription if quality != "bad" else decent_transcription
        )
        transcription_fidelity = "exact" if quality != "bad" else "decent"

        generated.append(
            {
                "id": img_id,
                "path": img_path,
                "response_id": resp["id"],
                "quality": quality,
                "font": font_file,
                "score": resp["score"],
                "rubric": resp["rubric"],
                "exact_transcription": exact_transcription,
                "decent_transcription": decent_transcription,
                "training_transcription": training_transcription,
                "transcription_fidelity": transcription_fidelity,
                "img_obj": img,  # kept in memory for b64 later
            }
        )

        print(f"  [{r_idx + 1}.{q_idx + 1}] {img_id}  {img.size[0]}x{img.size[1]}px")

print(f"\nGenerated {len(generated)} images total.")


# ============================================================
# CELL 6 — Save outputs
# ============================================================
# %%

# ── 1. Vision training JSONL ─────────────────────────────────────────────────
VISION_JSONL = "finetune-grading-vision.jsonl"
vision_entries = []

for item in generated:
    b64 = img_to_b64(item["img_obj"])
    rubric_prompt = build_rubric_prompt(item["rubric"])

    entry = {
        "messages": [
            {"role": "system", "content": SYSTEM},
            {
                "role": "user",
                "content": [
                    # image placeholder — image data stored in 'images' field below
                    {"type": "image"},
                    {"type": "text", "text": rubric_prompt},
                ],
            },
            {
                "role": "assistant",
                "content": json.dumps(
                    {
                        "transcription": item["training_transcription"],
                        "score": item["score"],
                    },
                    ensure_ascii=False,
                ),
            },
        ],
        # image stored as data URI so the JSONL is self-contained
        "images": [f"data:image/png;base64,{b64}"],
        # metadata (not used by trainer — just for reference)
        "_meta": {
            "id": item["id"],
            "quality": item["quality"],
            "transcription_fidelity": item["transcription_fidelity"],
            "score": item["score"],
        },
    }
    vision_entries.append(entry)

with open(VISION_JSONL, "w", encoding="utf-8") as f:
    for e in vision_entries:
        f.write(json.dumps(e, ensure_ascii=False) + "\n")

jsonl_size_kb = os.path.getsize(VISION_JSONL) // 1024
print(f"Saved {VISION_JSONL} — {len(vision_entries)} entries, {jsonl_size_kb} KB")


# ── 2. Image benchmark cases JSON ────────────────────────────────────────────
BENCHMARK_JSON = "image-benchmark-cases.json"

benchmark = {
    "description": (
        "Synthetic handwritten statistics student responses for post-training evaluation. "
        "After fine-tuning, feed each image + rubric to the model; compare transcription "
        "and score against groundTruthScore and acceptableTranscription."
    ),
    "handwriting_quality": {
        "good": "clean, neat — easy to read",
        "medium": "normal student handwriting — some wobble",
        "bad": "messy — significant jitter, harder to read",
    },
    "transcription_fidelity": {
        "exact": "training_transcription matches rendered image exactly (good + medium)",
        "decent": "training_transcription has realistic OCR-style errors (bad quality only)",
    },
    "cases": [],
}

for item in generated:
    benchmark["cases"].append(
        {
            "id": item["id"],
            "imageFile": item["path"],
            "handwritingQuality": item["quality"],
            "transcriptionFidelity": item["transcription_fidelity"],
            "topic": item["response_id"],
            "rubricQuestion": item["rubric"]["question"],
            "groundTruthScore": item["score"],
            "exactTranscription": item["exact_transcription"],
            "acceptableTranscription": item["decent_transcription"],
            # Full rubric prompt — used directly by run-image-benchmark.js
            "rubricPrompt": build_rubric_prompt(item["rubric"]),
        }
    )

with open(BENCHMARK_JSON, "w", encoding="utf-8") as f:
    json.dump(benchmark, f, indent=2, ensure_ascii=False)

print(f"Saved {BENCHMARK_JSON} — {len(benchmark['cases'])} cases")

# Summary
print("\nQuality distribution:")
for q in QUALITIES:
    n = sum(1 for c in benchmark["cases"] if c["handwritingQuality"] == q)
    fid = "exact" if q != "bad" else "decent"
    print(f"  {q:8s}: {n} images  ->  transcription: {fid}")

print("\nScore distribution:")
from collections import Counter

scores = Counter(c["groundTruthScore"] for c in benchmark["cases"])
for s in sorted(scores):
    print(f"  score {s}: {scores[s]} images")


# ============================================================
# CELL 7 — Download outputs (Colab) or print paths (local)
# ============================================================
# %%
import zipfile

zip_path = "handwriting-training-data.zip"
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
    zf.write(VISION_JSONL)
    zf.write(BENCHMARK_JSON)
    for item in generated:
        zf.write(item["path"])

zip_size_mb = os.path.getsize(zip_path) / 1024**2
print(f"Created {zip_path} ({zip_size_mb:.1f} MB)")

try:
    from google.colab import files as _colab_files

    print("Downloading zip...")
    print("Extract to: test-data/")
    _colab_files.download(zip_path)
except ImportError:
    print("\nNot in Colab. Files saved locally:")
    print(f"  {VISION_JSONL}")
    print(f"  {BENCHMARK_JSON}")
    print(f"  handwriting-images/  ({len(generated)} PNGs)")
    print(f"  {zip_path}  (zip of all outputs)")
    print("\nCopy to test-data/:")
    print(f"  cp {VISION_JSONL} test-data/")
    print(f"  cp {BENCHMARK_JSON} test-data/")
    print(f"  cp -r handwriting-images/ test-data/")
