"""
O.G.R.E Qwen3.5-9B Grading Fine-Tune — Colab Training Script
=============================================================
Run this in Google Colab with an A100 or L4 GPU (Runtime > Change runtime type > A100).

Steps:
  1. Run Cell 1: Install dependencies
  2. Run Cell 2: Load model
  3. Run Cell 3: Upload training data (finetune-grading.jsonl)
  4. Run Cell 4: Train (saves checkpoint to Google Drive on completion)
  4b. [RECOVERY] Cell 4b: Load from checkpoint if runtime disconnected
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

# Fix Pillow version conflict with Unsloth (remove _Ink import error)
subprocess.run(
    [sys.executable, "-m", "pip", "install", "pillow<10", "-q"],
    check=True,
)

subprocess.run(
    [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--upgrade",
        "--force-reinstall",
        "--no-cache-dir",
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

import torch

print("CUDA available:", torch.cuda.is_available())
print("GPU:", torch.cuda.get_device_name(0))
print(
    "VRAM:", round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 1), "GB"
)


# ============================================================
# CELL 2 — Load Qwen3.5-9B with bf16 LoRA
# ============================================================
# %%
from unsloth import FastLanguageModel

MAX_SEQ_LENGTH = 4096  # our prompts are long (~2-3K tokens)
LORA_RANK = 16
LORA_ALPHA = 16

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="unsloth/Qwen3.5-9B",  # instruct (chat) model
    max_seq_length=MAX_SEQ_LENGTH,
    load_in_4bit=False,  # bf16 — recommended for Qwen3.5
    load_in_16bit=True,
    full_finetuning=False,
    dtype=torch.bfloat16,
)

model = FastLanguageModel.get_peft_model(
    model,
    r=LORA_RANK,
    target_modules=[
        "q_proj",
        "k_proj",
        "v_proj",
        "o_proj",
        "gate_proj",
        "up_proj",
        "down_proj",
    ],
    lora_alpha=LORA_ALPHA,
    lora_dropout=0,
    bias="none",
    use_gradient_checkpointing="unsloth",
    random_state=42,
    max_seq_length=MAX_SEQ_LENGTH,
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
# CELL 4 — Train (2 epochs, ~30-45 min on A100)
# ============================================================
# %%
from trl import SFTTrainer, SFTConfig
from unsloth.chat_templates import train_on_responses_only

# Only compute loss on assistant responses (not the full prompt)
trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    args=SFTConfig(
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
        save_steps=50,
        output_dir="/content/outputs_qwen35_grader",
        seed=42,
        dataset_num_proc=1,
        report_to="none",  # disable wandb
    ),
)

# Train on responses only — model learns assistant outputs, not prompts
trainer = train_on_responses_only(
    trainer,
    instruction_part="<|im_start|>user\n",
    response_part="<|im_start|>assistant\n",
)

print("Starting training...")
train_result = trainer.train()
print("Training complete!")
print(f"  Final loss: {train_result.training_loss:.4f}")
print(f"  Steps: {train_result.global_step}")

# Save checkpoint to Google Drive to survive runtime disconnects
from google.colab import drive
import shutil

drive.mount("/content/drive")
DRIVE_CHECKPOINT_DIR = "/content/drive/MyDrive/qwen35-grader-checkpoint"
print(f"Saving checkpoint to Drive: {DRIVE_CHECKPOINT_DIR}")
shutil.copytree(
    "/content/outputs_qwen35_grader", DRIVE_CHECKPOINT_DIR, dirs_exist_ok=True
)
print("Checkpoint saved to Drive — safe to continue even if runtime disconnects.")


# ============================================================
# CELL 4b — RECOVERY: Load from checkpoint (run if runtime disconnected)
# ============================================================
# %% [Skip this cell if Cell 4 completed successfully]
# Run Cells 1 & 2 first to reload the environment, then run this cell
# instead of Cell 4 to restore training without retraining.

from google.colab import drive
from peft import PeftModel

drive.mount("/content/drive")
DRIVE_CHECKPOINT_DIR = "/content/drive/MyDrive/qwen35-grader-checkpoint"

# Find latest checkpoint
import os, glob

checkpoints = sorted(glob.glob(f"{DRIVE_CHECKPOINT_DIR}/checkpoint-*"))
latest = checkpoints[-1] if checkpoints else DRIVE_CHECKPOINT_DIR
print(f"Loading from: {latest}")

model = PeftModel.from_pretrained(model, latest)
print("Model restored from checkpoint — proceed to Cell 5.")


# ============================================================
# CELL 5 — Export to GGUF Q4_K_M
# ============================================================
# %%
GGUF_OUTPUT_DIR = "/content/qwen3-math-grader-gguf"

print("Exporting to GGUF Q4_K_M...")
model.save_pretrained_gguf(
    GGUF_OUTPUT_DIR,
    tokenizer,
    quantization_method="q4_k_m",
)

import os

gguf_files = [f for f in os.listdir(GGUF_OUTPUT_DIR) if f.endswith(".gguf")]
print(f"GGUF files created: {gguf_files}")
for f in gguf_files:
    size_gb = os.path.getsize(os.path.join(GGUF_OUTPUT_DIR, f)) / 1024**3
    print(f"  {f}: {size_gb:.2f} GB")


# ============================================================
# CELL 6 — Download GGUF to local machine
# ============================================================
# %%
# This will prompt a download in your browser.
# Save to: O.G.R.E-OllamaGradingRubricEvaluator/fine-tuned-model/

import os
from google.colab import files as colab_files

gguf_path = os.path.join(GGUF_OUTPUT_DIR, gguf_files[0])
print(f"Downloading: {gguf_path}")
print("Save to your local: fine-tuned-model/qwen3.5-math-grader.gguf")
colab_files.download(gguf_path)

print("""
=== DONE ===
Next steps (run locally after download):

1. Move the downloaded .gguf to:
   O.G.R.E-OllamaGradingRubricEvaluator/fine-tuned-model/qwen3-math-grader.gguf

2. Register in Ollama:
   ollama create qwen3.5-math-grader -f fine-tuned-model/Modelfile-qwen3.5-math-grader

3. Verify:
   ollama run qwen3.5-math-grader "Grade this: ..."

4. Run benchmark:
   bun run test-data/run-benchmark.js --only=Qwen35-FT --timeout=900000
""")
