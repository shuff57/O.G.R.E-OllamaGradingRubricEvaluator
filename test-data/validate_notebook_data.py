#!/usr/bin/env python3
"""
Validate that the notebook's data processing produces the exact format
unsloth's UnslothVisionDataCollator expects — without needing a GPU or unsloth.

Run: python test-data/validate_notebook_data.py
"""

import json, base64, io, sys
from PIL import Image as PILImage


def _to_list_content(msgs):
    """Same helper as Cell 3b."""
    out = []
    for m in msgs:
        m = dict(m)
        if isinstance(m["content"], str):
            m["content"] = [{"type": "text", "text": m["content"]}]
        out.append(m)
    return out


def validate_message(msg, label, allow_pil=False):
    """Validate a single message matches unsloth's expected format."""
    assert isinstance(msg, dict), f"{label}: message is not a dict"
    assert "role" in msg, f"{label}: missing 'role'"
    assert "content" in msg, f"{label}: missing 'content'"
    assert msg["role"] in ("system", "user", "assistant"), (
        f"{label}: bad role '{msg['role']}'"
    )
    content = msg["content"]
    assert isinstance(content, list), (
        f"{label}: content must be list, got {type(content).__name__}: {str(content)[:80]}"
    )
    for i, part in enumerate(content):
        assert isinstance(part, dict), f"{label} content[{i}]: not a dict"
        assert "type" in part, f"{label} content[{i}]: missing 'type' key"
        if part["type"] == "text":
            assert "text" in part, f"{label} content[{i}]: type=text but no 'text' key"
        elif part["type"] == "image":
            assert "image" in part, (
                f"{label} content[{i}]: type=image but no 'image' key "
                "(unfilled placeholder — this is the bug that crashes process_vision_info)"
            )
            if allow_pil:
                assert isinstance(part["image"], PILImage.Image), (
                    f"{label} content[{i}]: 'image' should be PIL Image"
                )
        elif part["type"] == "video":
            pass  # not used but valid
        else:
            print(f"  WARN {label} content[{i}]: unknown type '{part['type']}'")


def validate_example(ex, idx, allow_pil=False):
    """Validate a single training example."""
    label = f"example[{idx}]"
    assert isinstance(ex, dict), f"{label}: not a dict"
    assert "messages" in ex, f"{label}: missing 'messages' key"
    msgs = ex["messages"]
    assert isinstance(msgs, list), f"{label}: messages is not a list"
    assert len(msgs) >= 2, f"{label}: need at least 2 messages, got {len(msgs)}"
    for j, msg in enumerate(msgs):
        validate_message(msg, f"{label}.msg[{j}]", allow_pil=allow_pil)


# --- Load data files ---
DATA_DIR = "test-data"
errors = []

print("=" * 60)
print("Validating notebook data format (unsloth compatibility)")
print("=" * 60)

# 1. Text training data
print("\n--- Text training data ---")
with open(f"{DATA_DIR}/finetune-grading.jsonl") as f:
    text_raw = [json.loads(l) for l in f if l.strip()]
print(f"  Loaded {len(text_raw)} text examples")

text_training = [{"messages": _to_list_content(ex["messages"])} for ex in text_raw]
for i, ex in enumerate(text_training):
    try:
        validate_example(ex, i)
    except AssertionError as e:
        errors.append(f"TEXT TRAIN: {e}")
print(f"  ✓ {len(text_training)} text examples validated")

# 2. Vision training data
print("\n--- Vision training data ---")
with open(f"{DATA_DIR}/finetune-grading-vision.jsonl") as f:
    vision_raw = [json.loads(l) for l in f if l.strip()]
print(f"  Loaded {len(vision_raw)} vision examples")

vision_training = []
for idx, ex in enumerate(vision_raw):
    msgs = ex["messages"]
    # Decode images (just first 100 bytes to validate, use tiny placeholder)
    pil_images = []
    for img_str in ex.get("images", []):
        b64 = img_str.split(",", 1)[1] if "," in img_str else img_str
        pil_images.append(
            PILImage.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
        )

    # Same logic as Cell 3b: convert + fill placeholders
    conv_msgs = []
    for m in msgs:
        m_copy = dict(m)
        if isinstance(m_copy["content"], str):
            m_copy["content"] = [{"type": "text", "text": m_copy["content"]}]
        else:
            m_copy["content"] = [dict(c) for c in m_copy["content"]]
        # Fill image placeholders
        img_idx = 0
        for part in m_copy["content"]:
            if part.get("type") == "image" and img_idx < len(pil_images):
                part["image"] = pil_images[img_idx]
                img_idx += 1
        conv_msgs.append(m_copy)

    vision_training.append({"messages": conv_msgs})

for i, ex in enumerate(vision_training):
    try:
        validate_example(ex, i, allow_pil=True)
    except AssertionError as e:
        errors.append(f"VISION TRAIN: {e}")
print(f"  ✓ {len(vision_training)} vision examples validated")

# Check that all image placeholders were filled
unfilled = 0
for i, ex in enumerate(vision_training):
    for msg in ex["messages"]:
        for part in msg["content"]:
            if part.get("type") == "image" and "image" not in part:
                unfilled += 1
                errors.append(f"VISION TRAIN example[{i}]: unfilled image placeholder")
if unfilled == 0:
    print(f"  ✓ All image placeholders filled with PIL images")
else:
    print(f"  ✗ {unfilled} unfilled image placeholders!")

# 3. Text validation data
print("\n--- Text validation data ---")
with open(f"{DATA_DIR}/finetune-grading-val.jsonl") as f:
    val_text_raw = [json.loads(l) for l in f if l.strip()]
print(f"  Loaded {len(val_text_raw)} text val examples")

val_data = [{"messages": _to_list_content(ex["messages"])} for ex in val_text_raw]
for i, ex in enumerate(val_data):
    try:
        validate_example(ex, i)
    except AssertionError as e:
        errors.append(f"TEXT VAL: {e}")
print(f"  ✓ {len(val_data)} text val examples validated")

# 4. Vision validation data
print("\n--- Vision validation data ---")
with open(f"{DATA_DIR}/finetune-grading-val-vision.jsonl") as f:
    val_vision_raw = [json.loads(l) for l in f if l.strip()]
print(f"  Loaded {len(val_vision_raw)} vision val examples")

for idx, ex in enumerate(val_vision_raw):
    msgs = ex["messages"]
    pil_images = []
    for img_str in ex.get("images", []):
        b64 = img_str.split(",", 1)[1] if "," in img_str else img_str
        pil_images.append(
            PILImage.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
        )

    conv_msgs = []
    for m in msgs:
        m_copy = dict(m)
        if isinstance(m_copy["content"], str):
            m_copy["content"] = [{"type": "text", "text": m_copy["content"]}]
        else:
            m_copy["content"] = [dict(c) for c in m_copy["content"]]
        img_idx = 0
        for part in m_copy["content"]:
            if part.get("type") == "image" and img_idx < len(pil_images):
                part["image"] = pil_images[img_idx]
                img_idx += 1
        conv_msgs.append(m_copy)

    val_data.append({"messages": conv_msgs})

for i, ex in enumerate(val_data[len(val_text_raw) :]):
    try:
        validate_example(ex, i, allow_pil=True)
    except AssertionError as e:
        errors.append(f"VISION VAL: {e}")
print(f"  ✓ {len(val_vision_raw)} vision val examples validated")

# --- Summary ---
combined_train = text_training + vision_training
print(f"\n{'=' * 60}")
print(
    f"Training: {len(combined_train)} total ({len(text_training)} text + {len(vision_training)} vision)"
)
print(
    f"Validation: {len(val_data)} total ({len(val_text_raw)} text + {len(val_vision_raw)} vision)"
)

if errors:
    print(f"\n✗ {len(errors)} ERROR(S):")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)
else:
    print(f"\n✓ ALL CHECKS PASSED — data format matches unsloth expectations")
    sys.exit(0)
