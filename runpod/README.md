# RunPod Serverless Setup for O.G.R.E.

Use this guide to host the `qwen3.5-9B-stat-grader` model on RunPod Serverless so O.G.R.E.'s `ollama-cloud` provider can call it when you do not want to run Ollama locally.

## Prerequisites

- A RunPod account with billing enabled
- The GGUF model file: `qwen3.5-9B-stat-grader-Q4_K_M.gguf`
- A Modelfile for `qwen3.5-9B-stat-grader`

## Step 1: Create a Network Volume and upload the model

1. In RunPod, create a **Network Volume** in the same region where you plan to run the endpoint.
2. Upload these files to the volume:
   - `qwen3.5-9B-stat-grader-Q4_K_M.gguf`
   - your `Modelfile`
3. Keep note of the volume mount path you will use on the endpoint.

## Step 2: Create the Serverless Endpoint

1. Create a new **Serverless Endpoint** in RunPod.
2. Use the `runpod-worker-ollama` image.
3. Reference implementation: <https://github.com/SvenBrnn/runpod-worker-ollama>
4. Mount the Network Volume from Step 1 onto the worker.

## Step 3: Configure endpoint environment variables

Set the endpoint environment so the worker loads the grading model:

- `OLLAMA_MODEL_NAME=qwen3.5-9B-stat-grader`

Mount the Network Volume so the worker can access:

- `qwen3.5-9B-stat-grader-Q4_K_M.gguf`
- the Modelfile for `qwen3.5-9B-stat-grader`

## Step 4: Copy the Endpoint ID and API Key

After the endpoint is created:

1. Copy the **Endpoint ID** from RunPod.
2. Create or copy a **RunPod API Key**.
3. Your direct sync URL will be:

```text
https://api.runpod.ai/v2/<Endpoint ID>/runsync
```

## Step 5: Configure O.G.R.E.

You can configure O.G.R.E. either through settings or environment variables.

### Option A: O.G.R.E. settings

Paste the RunPod endpoint URL and API key into the `ollama-cloud` provider settings.

- Endpoint URL: `https://api.runpod.ai/v2/<Endpoint ID>/runsync`
- API key: your RunPod API key

### Option B: Environment variables

Set these before starting the grading server:

```bash
export OGRE_RUNPOD_ENDPOINT_ID="<Endpoint ID>"
export OGRE_RUNPOD_API_KEY="<RunPod API Key>"
```

O.G.R.E. will auto-create the `ollama-cloud` provider from these values.

## Test command

After configuring the endpoint, test it from the grading server workspace:

```bash
cd grading-server
node --input-type=module <<'EOF'
import { buildRunPodRequest } from './providers.js';

const req = buildRunPodRequest(
  {
    endpointId: process.env.OGRE_RUNPOD_ENDPOINT_ID,
    apiKey: process.env.OGRE_RUNPOD_API_KEY,
    model: 'qwen3.5-9B-stat-grader',
    temperature: 0.2,
  },
  [{ role: 'user', content: 'hi' }],
);

const res = await fetch(req.url, {
  method: 'POST',
  headers: req.headers,
  body: JSON.stringify(req.body),
});

console.log(res.status);
console.log(await res.text());
EOF
```

## Cost estimate

- About **$36/month** at roughly **300 requests/day**
- **$0 when idle** because the endpoint scales to zero between requests
