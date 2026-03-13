# ============================================================
# DEPRECATED — Use OGRE_Finetune_Qwen35_9B.ipynb instead.
#
# This script has a buggy rotary embedding monkey-patch that
# crashes at epoch 2. The notebook version uses transformers
# from git HEAD (which has the correct rotary implementation)
# and does not need the patch.
# Kept for historical reference only.
# ============================================================

# pyright: reportMissingImports=false, reportMissingTypeStubs=false, reportUnknownVariableType=false, reportUnknownMemberType=false, reportUnknownArgumentType=false, reportAny=false, reportUnknownLambdaType=false, reportUnknownParameterType=false, reportMissingParameterType=false, reportUnusedCallResult=false, reportDuplicateImport=false, reportUnusedImport=false, reportAttributeAccessIssue=false, reportArgumentType=false
"""
O.G.R.E Qwen3.5-9B Stat Grader — Colab Training Script
======================================================
Run this in Google Colab with an A100 or L4 GPU (Runtime > Change runtime type > A100).

Steps:
  1. Run Cell 1: Install dependencies
  2. Run Cell 2: Load model
  3. Run Cell 3: Upload finetune-grading.jsonl
  4. Run Cell 3b: Upload finetune-grading-vision.jsonl (176 training entries)
  5. Upload finetune-grading-val.jsonl AND finetune-grading-val-vision.jsonl before Cell 4
  6. Run Cell 4: Train (auto-recovers from Google Drive if runtime disconnected)
  7. Run Cell 4b: Post-training smoke test (MUST pass before proceeding)
  8. Run Cell 5: Export GGUF
  9. Run Cell 5b: Copy GGUF to Google Drive
  10. Run Cell 6: Download GGUF to your machine

After download, run in terminal:
  ollama create qwen3.5-9B-stat-grader -f fine-tuned-model/Modelfile-qwen3.5-9B-stat-grader
"""

# ============================================================
# CELL 1 — Install dependencies
# ============================================================
# %%
import subprocess, sys

subprocess.run(
    [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--upgrade",
        "unsloth",
        "unsloth_zoo",
    ],
    check=True,
)

subprocess.run(
    [
        sys.executable,
        "-m",
        "pip",
        "install",
        "trl>=0.15.0",
        "datasets",
        "bitsandbytes",
        "sentencepiece",
        "protobuf",
    ],
    check=True,
)

# Install transformers from source — pip release has a buggy apply_rotary_pos_emb
# for Qwen3.5's partial RoPE + MRoPE that crashes mid-training
subprocess.run(
    [
        sys.executable,
        "-m",
        "pip",
        "install",
        "git+https://github.com/huggingface/transformers.git",
    ],
    check=True,
)

# Pin Pillow AFTER unsloth — unsloth upgrades it as a dependency, breaking _Ink import
subprocess.run(
    [sys.executable, "-m", "pip", "install", "pillow<10", "-q"],
    check=True,
)

import torch

gpu_name = torch.cuda.get_device_name(0)
gpu_vram_gb = round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 1)
print(f"CUDA available: {torch.cuda.is_available()}")
print(f"GPU: {gpu_name}")
print(f"VRAM: {gpu_vram_gb} GB")

use_4bit = "A100" not in gpu_name
if use_4bit:
    print(f"⚠️  Expected A100 but got {gpu_name} — falling back to 4-bit quantization")
else:
    print("✅ A100 confirmed — using bf16 LoRA (best quality)")


# ============================================================
# CELL 2 — Load Qwen3.5-9B (vision-capable) with LoRA
# ============================================================
# %%

# Patch Qwen3.5 rotary embeddings — Unsloth's RoPE kernel computes cos with
# wrong rotary_dim for partial RoPE + MRoPE, causing torch.cat crash mid-training
import torch as _torch
from transformers.models.qwen3_5 import modeling_qwen3_5 as _mqwen

_orig_rope = _mqwen.apply_rotary_pos_emb


def _safe_apply_rotary_pos_emb(q, k, cos, sin, unsqueeze_dim=1):
    cos = cos.unsqueeze(unsqueeze_dim)
    sin = sin.unsqueeze(unsqueeze_dim)
    rotary_dim = min(cos.shape[-1], q.shape[-1])
    q_rot, q_pass = q[..., :rotary_dim], q[..., rotary_dim:]
    k_rot, k_pass = k[..., :rotary_dim], k[..., rotary_dim:]

    def _rotate_half(x):
        x1 = x[..., : x.shape[-1] // 2]
        x2 = x[..., x.shape[-1] // 2 :]
        return _torch.cat((-x2, x1), dim=-1)

    q_embed = (q_rot * cos) + (_rotate_half(q_rot) * sin)
    k_embed = (k_rot * cos) + (_rotate_half(k_rot) * sin)
    if q_pass.shape[-1] > 0:
        q_embed = _torch.cat([q_embed, q_pass], dim=-1)
        k_embed = _torch.cat([k_embed, k_pass], dim=-1)
    return q_embed, k_embed


_mqwen.apply_rotary_pos_emb = _safe_apply_rotary_pos_emb
print("✅ Patched Qwen3.5 apply_rotary_pos_emb")

from unsloth import FastVisionModel

MAX_SEQ_LENGTH = 8192
LORA_RANK = 16
LORA_ALPHA = 16

model, tokenizer = FastVisionModel.from_pretrained(
    model_name="Qwen/Qwen3.5-9B",
    max_seq_length=MAX_SEQ_LENGTH,
    load_in_4bit=use_4bit,
    load_in_16bit=not use_4bit,
    dtype=torch.bfloat16,
)

model = FastVisionModel.get_peft_model(
    model,
    r=LORA_RANK,
    lora_alpha=LORA_ALPHA,
    lora_dropout=0,
    bias="none",
    # Freeze vision encoder — preserves image understanding without retraining it
    finetune_vision_layers=False,
    # Fine-tune language layers only — this is where grading behavior lives
    finetune_language_layers=True,
    finetune_attention_modules=True,
    finetune_mlp_modules=True,
    use_gradient_checkpointing="unsloth",
    random_state=42,
)

print("Model loaded. Trainable params:")
model.print_trainable_parameters()


# ============================================================
# CELL 3 — Upload training data
# ============================================================
# %%
from google.colab import files as colab_files
import json

print("Upload finetune-grading.jsonl when prompted...")
uploaded = colab_files.upload()  # select finetune-grading.jsonl from your machine

# Parse JSONL
filename = list(uploaded.keys())[0]
raw_lines = uploaded[filename].decode("utf-8").strip().split("\n")
examples = [json.loads(l) for l in raw_lines if l.strip()]
print(f"Loaded {len(examples)} training examples")

# Verify format
assert examples[0]["messages"][0]["role"] == "system", "msg[0] should be system"
assert examples[0]["messages"][1]["role"] == "user", "msg[1] should be user"
assert examples[0]["messages"][2]["role"] == "assistant", "msg[2] should be assistant"
print("Format check passed")

# Convert to HuggingFace dataset
from datasets import Dataset


def apply_chat_template(example):
    """Format messages using Qwen3.5 chat template — thinking OFF."""
    text = tokenizer.apply_chat_template(
        example["messages"],
        tokenize=False,
        add_generation_prompt=False,
        enable_thinking=False,  # NO thinking mode — plan constraint
    )
    return {"text": text}


dataset = Dataset.from_list(examples)
dataset = dataset.map(apply_chat_template, batched=False)
print(f"Dataset ready. Sample:\n{dataset[0]['text'][:300]}...")


# ============================================================
# CELL 3b — Load vision JSONL (REQUIRED — 176 vision grading examples)
# ============================================================
# Upload finetune-grading-vision.jsonl — 176 vision training entries (base64 PNG handwriting images)
# generated by test-data/gen-handwriting-images.py, split by split-vision-val.py.
# This teaches the model to transcribe handwritten student work and grade it.
# Combined with text data: 283 text + 176 vision = 459 total training examples.
# %%
import base64, io
from PIL import Image as _PILImage
from transformers import AutoProcessor
from datasets import Dataset as _Dataset, concatenate_datasets

has_vision = False  # updated to True if vision data loads successfully
_processor = None  # initialized here so it's always bound
_collator = None

try:
    print("Upload finetune-grading-vision.jsonl when prompted...")
    _uv = colab_files.upload()
    _vf = list(_uv.keys())[0]
    _vlines = _uv[_vf].decode("utf-8").strip().split("\n")
    _vraw = [json.loads(l) for l in _vlines if l.strip()]
    print(f"Loaded {len(_vraw)} vision examples from {_vf}")

    # Load the vision processor (wraps tokenizer + image processor)
    print("Loading vision processor...")
    _processor = AutoProcessor.from_pretrained(
        "Qwen/Qwen3.5-9B",
        trust_remote_code=True,
    )

    # Process each vision entry: decode base64 → PIL Image, apply chat template
    _vision_examples = []
    for _idx, _ex in enumerate(_vraw):
        _msgs = _ex["messages"]

        # Decode images from data URI
        _pil_images = []
        for _img_str in _ex.get("images", []):
            _b64 = _img_str.split(",", 1)[1] if "," in _img_str else _img_str
            _pil_images.append(
                _PILImage.open(io.BytesIO(base64.b64decode(_b64))).convert("RGB")
            )

        # Apply Qwen vision chat template — inserts <|vision_start|>...<|vision_end|> tokens
        _text = _processor.apply_chat_template(
            _msgs,
            tokenize=False,
            add_generation_prompt=False,
        )

        _vision_examples.append({"text": _text, "images": _pil_images})

        if (_idx + 1) % 8 == 0:
            print(f"  Processed {_idx + 1}/{len(_vraw)} vision examples...")

    print(f"Vision dataset ready: {len(_vision_examples)} examples")

    # Merge with existing text dataset (text entries get images=None)
    _text_dataset_with_images = dataset.map(lambda _: {"images": None})
    _vision_dataset = _Dataset.from_list(_vision_examples)
    dataset = concatenate_datasets(
        [_text_dataset_with_images, _vision_dataset]
    ).shuffle(seed=42)

    print(
        f"Training dataset: {len(dataset)} total ({len(examples)} text + {len(_vision_examples)} vision)"
    )
    has_vision = True

except (KeyboardInterrupt, Exception) as _e:
    raise RuntimeError(
        "finetune-grading-vision.jsonl is required for this 459-example training run"
    ) from _e


# ============================================================
# CELL 4 — Train (2 epochs max, ~45-60 min on A100)
#           Auto-recovers from Google Drive if runtime disconnected
# ============================================================
# %%
import os, glob, shutil
from google.colab import drive
from peft import PeftModel
from trl import SFTTrainer, SFTConfig
from unsloth.chat_templates import train_on_responses_only

CHECKPOINT_DIR = "/content/outputs_qwen35_grader"
DRIVE_CHECKPOINT_DIR = "/content/drive/MyDrive/qwen35-grader-checkpoint"

# Mount Drive — used for both saving and recovery
drive.mount("/content/drive")

# Vision data collator — used when training includes image examples
if has_vision:
    from unsloth.trainer import UnslothVisionDataCollator

    _collator = UnslothVisionDataCollator(model, _processor)
    print("Vision data collator enabled.")

# Check if a completed checkpoint exists on Drive (runtime recovery)
drive_checkpoints = sorted(glob.glob(f"{DRIVE_CHECKPOINT_DIR}/checkpoint-*"))
if drive_checkpoints:
    latest = drive_checkpoints[-1]
    print(f"Found Drive checkpoint: {latest}")
    print("Skipping training — loading from checkpoint instead.")
    model = PeftModel.from_pretrained(model, latest)
    print("Model restored. Proceed to Cell 5.")
else:
    # No checkpoint — train from scratch
    # NOTE: Upload finetune-grading-val.jsonl AND finetune-grading-val-vision.jsonl
    #       to Colab file browser before running this cell
    import json as _json

    _val_lines = open("finetune-grading-val.jsonl").read().strip().split("\n")
    _val_examples = [_json.loads(l) for l in _val_lines if l.strip()]
    val_dataset = Dataset.from_list(_val_examples).map(
        apply_chat_template, batched=False
    )
    if has_vision:
        val_dataset = val_dataset.map(lambda _: {"images": None})
    print(f"Text validation: {len(val_dataset)} examples")

    # Load vision validation data (22 held-out handwriting image examples)
    if has_vision and os.path.exists("finetune-grading-val-vision.jsonl"):
        _val_vision_lines = (
            open("finetune-grading-val-vision.jsonl").read().strip().split("\n")
        )
        _val_vraw = [_json.loads(l) for l in _val_vision_lines if l.strip()]
        _val_vision_examples = []
        for _vex in _val_vraw:
            _vmsg = _vex["messages"]
            _vpil_imgs = []
            for _vimg_str in _vex.get("images", []):
                _vb64 = _vimg_str.split(",", 1)[1] if "," in _vimg_str else _vimg_str
                _vpil_imgs.append(
                    _PILImage.open(io.BytesIO(base64.b64decode(_vb64))).convert("RGB")
                )
            _vtext = _processor.apply_chat_template(
                _vmsg, tokenize=False, add_generation_prompt=False
            )
            _val_vision_examples.append({"text": _vtext, "images": _vpil_imgs})

        _val_vision_ds = _Dataset.from_list(_val_vision_examples)
        val_dataset = concatenate_datasets([val_dataset, _val_vision_ds])
        print(f"Vision validation: {len(_val_vraw)} examples")
    else:
        print("No vision validation file found — validating on text only")

    print(f"Combined validation: {len(val_dataset)} examples")

    _sft_args = SFTConfig(
        dataset_text_field="text",
        max_seq_length=MAX_SEQ_LENGTH,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        num_train_epochs=2,
        learning_rate=2e-5,
        warmup_ratio=0.1,
        lr_scheduler_type="cosine",
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        optim="adamw_8bit",
        logging_steps=5,
        eval_strategy="epoch",
        save_total_limit=3,
        save_steps=50,
        output_dir=CHECKPOINT_DIR,
        seed=42,
        dataset_num_proc=1,
        report_to="none",  # disable wandb
        # Required when dataset has extra columns (e.g. 'images')
        remove_unused_columns=False,
    )

    _trainer_kwargs = dict(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        eval_dataset=val_dataset,
        args=_sft_args,
    )
    if has_vision:
        # Vision collator handles image encoding and mixed text+vision batches
        _trainer_kwargs["data_collator"] = _collator

    trainer = SFTTrainer(**_trainer_kwargs)

    # Train on responses only — model learns assistant outputs, not prompts
    # (skip for vision training — train_on_responses_only doesn't support image tokens)
    if not has_vision:
        trainer = train_on_responses_only(
            trainer,
            instruction_part="<|im_start|>user\n",
            response_part="<|im_start|>assistant\n",
        )

    print("Starting training...")
    try:
        train_result = trainer.train()
        print("Training complete!")
        print(f"  Final loss: {train_result.training_loss:.4f}")
        print(f"  Steps: {train_result.global_step}")
    finally:
        # Save to Google Drive on completion OR crash/disconnect —
        # preserves the last save_steps=50 checkpoint either way
        checkpoints = sorted(glob.glob(f"{CHECKPOINT_DIR}/checkpoint-*"))
        if checkpoints:
            print(f"Saving checkpoint to Drive: {DRIVE_CHECKPOINT_DIR}")
            shutil.copytree(CHECKPOINT_DIR, DRIVE_CHECKPOINT_DIR, dirs_exist_ok=True)
            print(f"Checkpoint saved to Drive ({len(checkpoints)} checkpoint(s)).")
        else:
            print(
                "No checkpoints found to save — training may have crashed before step 50."
            )


# ============================================================
# CELL 4b — Post-training smoke test (MANDATORY before GGUF export)
# ============================================================
# %%
import json as _smoke_json

FastVisionModel.for_inference(model)

_smoke_prompts = [
    {
        "name": "Text-only grading (stats)",
        "messages": [
            {"role": "system", "content": "You are an expert grading assistant."},
            {
                "role": "user",
                "content": (
                    "Grade this student response on a scale of 0-10.\n\n"
                    "RUBRIC: Explain what a p-value represents in hypothesis testing.\n\n"
                    "STUDENT RESPONSE: A p-value is the probability that the null hypothesis is true. "
                    "If p < 0.05 we reject it.\n\n"
                    'Return JSON: {"score": <0-10>, "feedback": "..."}'
                ),
            },
        ],
    },
    {
        "name": "Text-only grading (different rubric)",
        "messages": [
            {"role": "system", "content": "You are an expert grading assistant."},
            {
                "role": "user",
                "content": (
                    "Grade this student response on a scale of 0-10.\n\n"
                    "RUBRIC: Describe the Central Limit Theorem and its importance.\n\n"
                    "STUDENT RESPONSE: The CLT says that sample means are normally distributed "
                    "when n is large enough, regardless of the population distribution. "
                    "This lets us use z-tests and confidence intervals.\n\n"
                    'Return JSON: {"score": <0-10>, "feedback": "..."}'
                ),
            },
        ],
    },
]

print("=== POST-TRAINING SMOKE TEST ===")
_smoke_pass = 0
for _sp in _smoke_prompts:
    print(f"\n--- {_sp['name']} ---")
    _inputs = tokenizer.apply_chat_template(
        _sp["messages"],
        tokenize=True,
        add_generation_prompt=True,
        enable_thinking=False,
        return_tensors="pt",
    ).to(model.device)
    _output = model.generate(input_ids=_inputs, max_new_tokens=512, temperature=0.2)
    _decoded = tokenizer.decode(
        _output[0][_inputs.shape[-1] :], skip_special_tokens=True
    )
    print(f"Output: {_decoded[:300]}")
    try:
        _parsed = _smoke_json.loads(_decoded.strip())
        _score = _parsed.get("score")
        assert isinstance(_score, (int, float)) and 0 <= _score <= 10, f"score={_score}"
        print(f"✅ Valid JSON, score={_score}")
        _smoke_pass += 1
    except Exception as _e:
        print(f"❌ FAILED: {_e}")

# Vision smoke test — use first image from training data if available
if has_vision and _vraw:
    print(f"\n--- Vision grading (handwriting image) ---")
    _vex = _vraw[0]
    _vmsg = _vex["messages"]
    _vimg_str = _vex["images"][0]
    _vb64 = _vimg_str.split(",", 1)[1] if "," in _vimg_str else _vimg_str
    _vpil = _PILImage.open(io.BytesIO(base64.b64decode(_vb64))).convert("RGB")

    _vtext = _processor.apply_chat_template(
        _vmsg[:2],
        tokenize=False,
        add_generation_prompt=True,
    )
    _vinputs = _processor(text=[_vtext], images=[_vpil], return_tensors="pt").to(
        model.device
    )
    _voutput = model.generate(**_vinputs, max_new_tokens=512, temperature=0.2)
    _vdecoded = tokenizer.decode(
        _voutput[0][_vinputs["input_ids"].shape[-1] :], skip_special_tokens=True
    )
    print(f"Output: {_vdecoded[:300]}")
    try:
        _vparsed = _smoke_json.loads(_vdecoded.strip())
        assert "score" in _vparsed, "missing 'score'"
        assert "transcription" in _vparsed, "missing 'transcription'"
        print(
            f"✅ Valid JSON, score={_vparsed['score']}, transcription length={len(_vparsed['transcription'])}"
        )
        _smoke_pass += 1
    except Exception as _e:
        print(f"❌ FAILED: {_e}")

_smoke_total = len(_smoke_prompts) + (1 if has_vision else 0)
print(f"\n=== SMOKE TEST RESULT: {_smoke_pass}/{_smoke_total} passed ===")
if _smoke_pass < _smoke_total:
    print("⚠️  Some smoke tests failed. Review output before proceeding to GGUF export.")
else:
    print("✅ All smoke tests passed — safe to proceed to Cell 5 (GGUF export).")


# ============================================================
# CELL 5 — Export to GGUF Q4_K_M
# ============================================================
# %%
GGUF_OUTPUT_DIR = "/content/qwen35-stat-grader-gguf"
GGUF_ACTUAL_DIR = "/content/qwen35-stat-grader-gguf_gguf"  # Unsloth appends _gguf

print("Exporting to GGUF Q4_K_M...")
model.save_pretrained_gguf(
    GGUF_OUTPUT_DIR,
    tokenizer,
    quantization_method="q4_k_m",
)

import os, glob

# Unsloth saves to <dir>_gguf — search both locations
gguf_files = glob.glob(f"{GGUF_ACTUAL_DIR}/*.Q4_K_M.gguf") or glob.glob(
    f"{GGUF_OUTPUT_DIR}/*.gguf"
)
print(f"GGUF files found: {gguf_files}")
for f in gguf_files:
    size_gb = os.path.getsize(f) / 1024**3
    print(f"  {f}: {size_gb:.2f} GB")


# ============================================================
# CELL 5b — Copy GGUF to Google Drive + generate checksum
# ============================================================
# This is the PERSISTENCE step. Colab's /content/ is ephemeral.
# Drive survives session disconnects. Do this BEFORE downloading.
# %%
import shutil, hashlib, os

gguf_files = glob.glob(f"{GGUF_ACTUAL_DIR}/*.Q4_K_M.gguf") or glob.glob(
    f"{GGUF_OUTPUT_DIR}/*.gguf"
)
assert gguf_files, "No GGUF file found — run Cell 5 first"
gguf_path = gguf_files[0]
print(f"Found GGUF: {gguf_path} ({os.path.getsize(gguf_path) / 1024**3:.2f} GB)")

DRIVE_GGUF_DIR = "/content/drive/MyDrive/models"
DRIVE_GGUF_NAME = "qwen3.5-9B-stat-grader-Q4_K_M.gguf"
os.makedirs(DRIVE_GGUF_DIR, exist_ok=True)
drive_gguf_path = f"{DRIVE_GGUF_DIR}/{DRIVE_GGUF_NAME}"

print(f"Copying GGUF to Drive: {drive_gguf_path}")
print("This may take 2-5 minutes...")
shutil.copy(gguf_path, drive_gguf_path)
print("Copy complete!")

print("Generating md5 checksum...")
md5 = hashlib.md5()
with open(drive_gguf_path, "rb") as f:
    for chunk in iter(lambda: f.read(8192), b""):
        md5.update(chunk)
checksum = md5.hexdigest()
print(f"MD5: {checksum}")

checksum_path = f"{DRIVE_GGUF_DIR}/{DRIVE_GGUF_NAME}.md5"
with open(checksum_path, "w") as f:
    f.write(f"{checksum}  {DRIVE_GGUF_NAME}\n")
print(f"Checksum saved to Drive: {checksum_path}")

print(f"""
=== GGUF Saved to Drive ===
File: {drive_gguf_path}
MD5:  {checksum}

IMPORTANT: Record this MD5 checksum!
After downloading locally, verify with:
  md5sum fine-tuned-model/qwen3.5-9B-stat-grader-Q4_K_M.gguf
Expected: {checksum}
""")


# ============================================================
# CELL 6 — Download GGUF from Drive to local machine
# ============================================================
# %%
# PRIMARY METHOD: Download from Google Drive (more reliable for large files)
#   1. Go to drive.google.com
#   2. Navigate to My Drive > models/
#   3. Download: qwen3.5-9B-stat-grader-Q4_K_M.gguf (~5-6 GB)
#   4. Place in: O.G.R.E-OllamaGradingRubricEvaluator/fine-tuned-model/
#
# FALLBACK METHOD: Direct Colab download (unreliable for large files)

import os
from google.colab import files as colab_files

# Unsloth saves to <dir>_gguf — search both locations
gguf_files = glob.glob(f"{GGUF_ACTUAL_DIR}/*.Q4_K_M.gguf") or glob.glob(
    f"{GGUF_OUTPUT_DIR}/*.gguf"
)
assert gguf_files, "No GGUF found — run Cell 5 first"
gguf_path = gguf_files[0]
size_gb = os.path.getsize(gguf_path) / 1024**3
print(f"Attempting browser download: {gguf_path} ({size_gb:.2f} GB)")
print("NOTE: For reliable download, use Google Drive (see comments above)")
colab_files.download(gguf_path)

print("""
=== DONE — Next Steps (run locally after download) ===

1. Move the downloaded .gguf to:
   fine-tuned-model/qwen3.5-9B-stat-grader-Q4_K_M.gguf

2. Verify integrity (compare with MD5 from Cell 5b):
   md5sum fine-tuned-model/qwen3.5-9B-stat-grader-Q4_K_M.gguf

3. Register in Ollama (run from fine-tuned-model/ directory):
   ollama create qwen3.5-9B-stat-grader -f Modelfile-qwen3.5-9B-stat-grader

4. Verify:
   ollama run qwen3.5-9B-stat-grader "test"

5. Run benchmark:
   bun run test-data/run-benchmark.js --only=qwen3.5-9B-stat-grader
""")


# ============================================================
# CELL 7 — Push to Hugging Face Hub
# ============================================================
# %%
# Prerequisites:
#   1. Create a free account at https://huggingface.co
#   2. Create a write-access token at https://huggingface.co/settings/tokens
#   3. Create a repo at https://huggingface.co/new (or let this script create it)
#
# Set your HF username and desired repo name below, then run this cell.
# You will be prompted to paste your token when huggingface_hub.login() runs.

HF_USERNAME = "shuff57"
HF_REPO_NAME = "qwen3.5-math-grader"

# ── Login ────────────────────────────────────────────────────────────────────
from huggingface_hub import login, HfApi

login()  # prompts for token; paste your write-access HF token

# ── Option A: Push LoRA adapters only (~100 MB, fast upload) ─────────────────
# Useful for reproducibility — anyone with the base model can merge these.
print(f"\nPushing LoRA adapters to {HF_USERNAME}/{HF_REPO_NAME}-lora ...")
model.push_to_hub(
    f"{HF_USERNAME}/{HF_REPO_NAME}-lora",
    tokenizer=tokenizer,
    private=False,  # set True if you want a private repo
)
tokenizer.push_to_hub(f"{HF_USERNAME}/{HF_REPO_NAME}-lora", private=False)
print("LoRA adapters pushed.")

# ── Option B: Push GGUF directly (~5 GB, slower upload) ──────────────────────
# Useful so others can ollama pull directly from HF without any merge step.
# Comment out Option A above and uncomment below to use instead (or run both).

# print(f"\nPushing GGUF to {HF_USERNAME}/{HF_REPO_NAME}-gguf ...")
# model.push_to_hub_gguf(
#     f"{HF_USERNAME}/{HF_REPO_NAME}-gguf",
#     tokenizer,
#     quantization_method="q4_k_m",
#     private=False,
# )
# print("GGUF pushed.")

# ── Print usage instructions ──────────────────────────────────────────────────
print(f"""
=== Pushed to Hugging Face ===

LoRA adapters: https://huggingface.co/{HF_USERNAME}/{HF_REPO_NAME}-lora

To use the GGUF in Ollama from HF:
  1. Download the .gguf from the HF repo Files tab
  2. Place in fine-tuned-model/qwen3.5-math-grader.gguf
  3. ollama create qwen3.5-math-grader -f fine-tuned-model/Modelfile-qwen3.5-math-grader
""")
