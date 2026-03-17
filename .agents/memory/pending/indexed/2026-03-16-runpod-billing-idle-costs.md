# RunPod Billing — Idle & Stopped Pod Costs

## What was learned

- RunPod GPU Pods (On-Demand/Spot) charge the **full GPU rate** while running, even if idle with no workload hitting them.
- **Stopped** pods only charge for disk/volume storage (~$0.10/GB/mo) — the GPU is released back to the pool.
- **Serverless** endpoints scale to zero with no charge when idle — true pay-per-use billing.
- **Terminated/deleted** pods incur no charges at all.

## Cost table

| State | Serverless | GPU Pod (On-Demand) | GPU Pod (Spot) |
|---|---|---|---|
| Running/Active | Per-second compute | Full GPU rate | Discounted GPU rate |
| Idle (running, no work) | No charge (scales to 0) | Full GPU rate (expensive!) | Full GPU rate |
| Stopped | No charge | Disk storage only | Disk storage only |
| Terminated | No charge | No charge | No charge |

## Recommendations for O.G.R.E.

- If running Ollama on a RunPod GPU Pod for bursty grading work, **stop the pod** between grading sessions to avoid paying idle GPU time.
- Serverless is the most cost-efficient option for intermittent grading workloads (true scale-to-zero).
- Volume and model data persist across stop/start cycles — only storage is billed when stopped.
- Always verify pod state after grading sessions to avoid surprise charges from forgotten running pods.

## Pattern

- Cloud GPU billing awareness: "running but idle" is the most common cost trap. Always stop or terminate when done.
