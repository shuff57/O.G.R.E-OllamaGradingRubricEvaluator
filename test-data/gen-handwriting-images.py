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
    # ── binomial ─────────────────────────────────────────────────────────────
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
]

QUALITIES = ["good", "medium", "bad"]
FONTS = ["Caveat-Regular.ttf", "Kalam-Regular.ttf"]  # alternate for visual variety

n_images = len(RESPONSES) * len(QUALITIES)
print(
    f"Defined {len(RESPONSES)} responses x {len(QUALITIES)} quality levels = {n_images} images"
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
