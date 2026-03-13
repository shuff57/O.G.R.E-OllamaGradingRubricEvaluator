"""
split-vision-val.py — Splits finetune-grading-vision.jsonl into train + val.

IDs follow: {num}_{topic}_{quality}_{fidelity} (e.g. "01_t_test_weak_good")
Real topics: t_test, z_score, ci, etc. (22 total), 9 entries each.
Holds out 1 per real topic (22 val), cycling low/mid/high score tiers.

Produces:
  finetune-grading-vision.jsonl      — 176 training entries (overwrites)
  finetune-grading-val-vision.jsonl  — 22 validation entries (new)
"""

import json
import os
import random
from collections import Counter, defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
VISION_PATH = os.path.join(SCRIPT_DIR, "finetune-grading-vision.jsonl")
VAL_VISION_PATH = os.path.join(SCRIPT_DIR, "finetune-grading-val-vision.jsonl")

random.seed(42)

with open(VISION_PATH) as f:
    entries = [json.loads(line) for line in f if line.strip()]

print(f"Loaded {len(entries)} vision entries")

# Group by real topic: "01_t_test_weak_good" → "t_test"
topics = defaultdict(list)
for entry in entries:
    entry_id = entry.get("_meta", {}).get("id", "")
    no_num = "_".join(entry_id.split("_")[1:])  # strip leading number
    real_topic = (
        "_".join(no_num.rsplit("_", 2)[:-2]) if no_num.count("_") >= 2 else no_num
    )
    topics[real_topic].append(entry)

print(f"Found {len(topics)} real topics:")
for key, group in sorted(topics.items()):
    scores = sorted(set(e["_meta"]["score"] for e in group))
    print(f"  {key}: {len(group)} entries, scores={scores}")

tier_cycle = ["low", "mid", "high"]
val_entries = []
train_entries = []

for i, (key, group) in enumerate(sorted(topics.items())):
    target_tier = tier_cycle[i % 3]

    low = [e for e in group if e["_meta"]["score"] <= 4]
    mid = [e for e in group if 5 <= e["_meta"]["score"] <= 7]
    high = [e for e in group if e["_meta"]["score"] >= 8]
    candidates = (
        {"low": low, "mid": mid, "high": high}[target_tier] or low or mid or high
    )

    held_out = random.choice(candidates)
    val_entries.append(held_out)

    for e in group:
        if e is not held_out:
            train_entries.append(e)

print(f"\nSplit:")
print(f"  Training: {len(train_entries)}")
print(f"  Validation: {len(val_entries)}")
print(
    f"  Val scores: {dict(sorted(Counter(e['_meta']['score'] for e in val_entries).items()))}"
)

with open(VAL_VISION_PATH, "w") as f:
    for entry in val_entries:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
print(f"\nWrote: {VAL_VISION_PATH}")

with open(VISION_PATH, "w") as f:
    for entry in train_entries:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
print(f"Wrote: {VISION_PATH} ({len(train_entries)} entries)")
