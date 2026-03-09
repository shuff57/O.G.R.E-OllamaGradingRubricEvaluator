"""
O.G.R.E Qwen3.5-9B Grading Fine-Tune — Colab Training Script
=============================================================
Run this in Google Colab with an A100 or L4 GPU (Runtime > Change runtime type > A100).

Steps:
  1. Run Cell 1: Install dependencies
  2. Run Cell 2: Load model
  3. Run Cell 3: Upload training data (finetune-gptoss-qwen.jsonl)
  4. Run Cell 4: Train (auto-recovers from Google Drive if runtime disconnected)
  5. Run Cell 5: Export GGUF
  6. Run Cell 6: Download GGUF to your machine

After download, run in terminal:
  ollama create qwen3.5-math-grader -f fine-tuned-model/Modelfile-qwen3.5-math-grader
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
        "transformers>=4.51.0",
        "trl>=0.15.0",
        "datasets",
        "bitsandbytes",
        "sentencepiece",
        "protobuf",
    ],
    check=True,
)

# Pin Pillow AFTER unsloth — unsloth upgrades it as a dependency, breaking _Ink import
subprocess.run(
    [sys.executable, "-m", "pip", "install", "pillow<10", "-q"],
    check=True,
)

import torch

print("CUDA available:", torch.cuda.is_available())
print("GPU:", torch.cuda.get_device_name(0))
print(
    "VRAM:", round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 1), "GB"
)


# ============================================================
# CELL 2 — Load Qwen3.5-9B (vision-capable) with LoRA
# ============================================================
# %%
# FastVisionModel preserves the vision encoder in the exported GGUF,
# enabling the grader to accept handwritten student work images.
# Vision layers are frozen (finetune_vision_layers=False) — we only
# fine-tune language layers for grading behavior.
from unsloth import FastVisionModel

MAX_SEQ_LENGTH = 4096  # our prompts are long (~2-3K tokens)
LORA_RANK = 16
LORA_ALPHA = 16

model, tokenizer = FastVisionModel.from_pretrained(
    model_name="Qwen/Qwen3.5-9B",  # official Qwen source, vision-capable
    max_seq_length=MAX_SEQ_LENGTH,
    load_in_4bit=False,  # A100 40GB has plenty of VRAM — bf16 for best training quality
    load_in_16bit=True,
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
# CELL 3b — Load vision JSONL (OPTIONAL — skip for text-only training)
# ============================================================
# Run this cell only if you have finetune-grading-vision.jsonl from
# gen-handwriting-images.py. It adds 24 image-based grading examples
# to the training set, teaching the model to transcribe then grade.
# %%
import base64, io
from PIL import Image as _PILImage
from transformers import AutoProcessor
from datasets import Dataset as _Dataset, concatenate_datasets

HAS_VISION = False  # updated to True if vision data loads successfully
_processor = None  # initialized here so it's always bound
_collator = None

try:
    print("Upload finetune-grading-vision.jsonl when prompted (Ctrl+C to skip)...")
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
        f"Combined dataset: {len(dataset)} total ({len(examples)} text + {len(_vision_examples)} vision)"
    )
    HAS_VISION = True

except (KeyboardInterrupt, Exception) as _e:
    print(f"Skipping vision data ({type(_e).__name__}: {_e}). Text-only training.")


# ============================================================
# CELL 4 — Train (3 epochs, ~45-60 min on A100)
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
if HAS_VISION:
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
    _sft_args = SFTConfig(
        dataset_text_field="text",
        max_seq_length=MAX_SEQ_LENGTH,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        num_train_epochs=3,
        learning_rate=2e-5,
        warmup_ratio=0.1,
        lr_scheduler_type="cosine",
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        optim="adamw_8bit",
        logging_steps=5,
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
        args=_sft_args,
    )
    if HAS_VISION:
        # Vision collator handles image encoding and mixed text+vision batches
        _trainer_kwargs["data_collator"] = _collator

    trainer = SFTTrainer(**_trainer_kwargs)

    # Train on responses only — model learns assistant outputs, not prompts
    # (skip for vision training — train_on_responses_only doesn't support image tokens)
    if not HAS_VISION:
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
# CELL 5 — Export to GGUF Q4_K_M
# ============================================================
# %%
GGUF_OUTPUT_DIR = "/content/qwen3-math-grader-gguf"
GGUF_ACTUAL_DIR = "/content/qwen3-math-grader-gguf_gguf"  # Unsloth appends _gguf

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
# CELL 6 — Download GGUF to local machine
# ============================================================
# %%
# This will prompt a download in your browser.
# Save to: O.G.R.E-OllamaGradingRubricEvaluator/fine-tuned-model/

import os
from google.colab import files as colab_files

# Unsloth saves to <dir>_gguf — use the known output path directly
gguf_path = "/content/qwen3-math-grader-gguf_gguf/Qwen3.5-9B.Q4_K_M.gguf"
size_gb = os.path.getsize(gguf_path) / 1024**3
print(f"Downloading: {gguf_path} ({size_gb:.2f} GB)")
print("Save to your local: fine-tuned-model/qwen3.5-math-grader.gguf")
colab_files.download(gguf_path)

print("""
=== DONE ===
Next steps (run locally after download):

1. Move the downloaded .gguf to:
   O.G.R.E-OllamaGradingRubricEvaluator/fine-tuned-model/qwen3.5-math-grader.gguf

2. Register in Ollama:
   ollama create qwen3.5-math-grader -f fine-tuned-model/Modelfile-qwen3.5-math-grader

3. Verify:
   ollama run qwen3.5-math-grader "test"

4. Run benchmark:
   bun run test-data/run-benchmark.js --only=Qwen35-FT --timeout=900000

5. (Optional) Push to Hugging Face — run Cell 7
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
