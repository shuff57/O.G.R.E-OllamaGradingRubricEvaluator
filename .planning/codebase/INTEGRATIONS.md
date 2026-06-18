# External Integrations

## APIs

### MyOpenMath (MOM)
- **Purpose**: Online math homework platform -- source of student responses, assignments, gradebooks
- **Access method**: Browser automation via embedded Electron WebContentsView + CDP
- **Key files**: `ogre-desktop/src/lib/discover.ts`, `ogre-desktop/src/lib/agent-loop.ts`, `ogre-desktop/src/lib/dom-snapshot.ts`
- **Agent skills**: `.agents/gradebook/gb-pipeline.md`, `.agents/gradebook/gb-sync.md`, `.agents/grading/grade-frq-aio.md`
- **URL patterns**: `myopenmath.com`

### Aeries (Student Information System)
- **Purpose**: School gradebook where graded scores are synced
- **Access method**: Browser automation via embedded browser and agent skills
- **Agent skills**: `.agents/gradebook/gb-new-assignment.md`, `.agents/gradebook/gb-compare.md`
- **URL patterns**: Varies by school district

### RunPod (Cloud GPU)
- **Purpose**: Serverless GPU endpoint for running Ollama models in the cloud
- **Endpoint**: `https://api.runpod.ai/v2/{endpoint_id}/runsync`
- **Auth**: Bearer token via `OGRE_RUNPOD_API_KEY` env var or provider config
- **Key files**: `grading-server/providers.js` (`buildRunPodRequest`), `grading-server/config.js` (`mergeCloudProviderFromEnv`)

### GitHub Copilot API
- **Purpose**: Access GitHub Copilot models for grading
- **Endpoint**: `https://api.github.com/copilot_internal/v2/token` (session token exchange)
- **Key files**: `grading-server/providers.js` (`getCopilotSessionToken`), `ogre-desktop/src/lib/oauth.ts` (`startGitHubDeviceFlow`)

### models.dev
- **Purpose**: Live model catalog for Anthropic models (cached 1 hour)
- **Endpoint**: `https://models.dev/api.json`
- **Key files**: `ogre-desktop/src/lib/oauth.ts` (`fetchAnthropicModelsFromModelsDev`)

### HuggingFace Hub
- **Purpose**: Download embedding model files (Xenova/all-MiniLM-L6-v2)
- **Endpoint**: `https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/`
- **Key files**: `grading-server/local-embedder.js`
- **Cache**: `~/.cache/ogre/models/Xenova/all-MiniLM-L6-v2/`

### GitHub Releases
- **Purpose**: Auto-update distribution for the desktop app
- **Config**: `ogre-desktop/electron-builder.yml` (`publish.provider: github`)
- **Key files**: `ogre-desktop/electron-main/updater.ts`

## AI/LLM

### Ollama (Local)
- **Type**: Local LLM inference
- **Endpoint**: Configurable, typically `http://localhost:11434/api/chat`
- **Models**: Custom fine-tuned models (created via Ollama Modelfiles)
- **Key files**: `grading-server/providers.js` (`buildOllamaRequest`, `parseOllamaResponse`)
- **Features**: Image support (base64), reasoning model fallback (thinking field), 60m keep_alive

### Anthropic (Claude)
- **Type**: Cloud LLM
- **Endpoint**: `https://api.anthropic.com/v1/messages`
- **Models**: Claude Opus 4, Sonnet 4, 3.7 Sonnet, 3.5 Sonnet/Haiku, 3 Opus
- **Auth**: API key (x-api-key header) or OAuth Bearer token with refresh
- **Key files**: `grading-server/providers.js` (`buildAnthropicRequest`), `grading-server/server.js` (`ensureValidAnthropicToken`)

### OpenAI (ChatGPT)
- **Type**: Cloud LLM
- **Endpoint**: `https://api.openai.com/v1/chat/completions`
- **Auth**: API key or OAuth device flow (token exchange: id_token -> access_token)
- **Key files**: `grading-server/providers.js` (`buildOpenAIRequest`), `ogre-desktop/src/lib/oauth.ts` (`startChatGPTDeviceFlow`)

### Google Gemini
- **Type**: Cloud LLM
- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- **Auth**: API key (query parameter)
- **Key files**: `grading-server/providers.js` (`buildGoogleGeminiRequest`, `parseGoogleGeminiResponse`)

### GitHub Models (via Copilot)
- **Type**: Cloud LLM
- **Endpoint**: `https://models.inference.ai.azure.com/chat/completions`
- **Auth**: GitHub OAuth -> Copilot session token exchange
- **Key files**: `grading-server/providers.js` (`buildGitHubModelsRequest`, `getCopilotSessionToken`)

### Local Embeddings (ONNX)
- **Type**: Local embedding inference
- **Model**: Xenova/all-MiniLM-L6-v2 (quantized ONNX, 384 dimensions)
- **Runtime**: `onnxruntime-node` + `@huggingface/tokenizers`
- **Performance**: ~150ms cold start (cached), 2-3ms per inference
- **Key files**: `grading-server/local-embedder.js`

### Embedding Providers (Cloud)
- **Providers**: Ollama, OpenAI, Gemini, GitHub (configurable)
- **Key files**: `grading-server/embedding-adapters.js`

## Browser Automation

### Electron WebContentsView (Embedded Browser)
- **Purpose**: Hosts MyOpenMath and Aeries pages inside the desktop app
- **Key files**: `ogre-desktop/electron-main/browser-manager.ts`
- **Features**: Tab management (create/destroy/show/hide), URL navigation, content event forwarding

### Chrome DevTools Protocol (CDP)
- **Purpose**: DOM inspection, accessibility tree extraction, JavaScript evaluation in embedded pages
- **Port**: 9223 (hardcoded in `ogre-desktop/electron-main/main.ts`)
- **Key files**: `ogre-desktop/electron-main/cdp-bridge.ts`, `ogre-desktop/src/lib/cdp-client.ts`, `ogre-desktop/src/lib/cdp-actions.ts`
- **Capabilities**: Page.enable, Runtime.enable, DOM.enable, Accessibility.enable
- **Port file**: `~/.ogre/cdp-port` (written for external tool discovery)

### Agent Loop (Browser Agent)
- **Purpose**: AI-driven browser automation loop that reads page state and takes actions
- **Key files**: `ogre-desktop/src/lib/agent-loop.ts`, `ogre-desktop/src/lib/agent-prompt.ts`, `ogre-desktop/src/lib/agent-api.ts`
- **Supporting**: `ogre-desktop/src/lib/agent-dom.ts`, `ogre-desktop/src/lib/agent-dom-fuzzy.ts`, `ogre-desktop/src/lib/browser-actions.ts`

### DOM Snapshot & Discovery
- **Purpose**: Structural extraction of page elements for AI context and site profile generation
- **Key files**: `ogre-desktop/src/lib/dom-snapshot.ts`, `ogre-desktop/src/lib/discover.ts`, `ogre-desktop/src/lib/heuristic-detector.ts`

## Authentication

### Anthropic OAuth (PKCE Authorization Code + Copy-Paste)
- **Client ID**: `9d1c250a-e61b-44d9-88ed-5944d1962f5e`
- **Auth URL**: `https://claude.ai/oauth/authorize`
- **Token URL**: `https://console.anthropic.com/v1/oauth/token`
- **Flow**: PKCE code challenge -> user copies auth code from Anthropic callback page -> token exchange
- **Scopes**: `org:create_api_key user:profile user:inference`
- **Refresh**: Automatic refresh with 60s buffer before expiry (server-side in `grading-server/server.js`)
- **Key files**: `ogre-desktop/src/lib/oauth.ts` (`startClaudeOAuthFlow`), `ogre-desktop/electron-main/oauth-server.ts`

### GitHub Device Flow
- **Client ID**: `Iv1.b507a08c87ecfe98` (VS Code Copilot app)
- **Endpoints**: `https://github.com/login/device/code`, `https://github.com/login/oauth/access_token`
- **Flow**: Device code + polling per RFC 8628
- **Key files**: `ogre-desktop/src/lib/oauth.ts` (`startGitHubDeviceFlow`)

### OpenAI/ChatGPT Device Flow
- **Client ID**: `app_EMoamEEZ73f0CkXaXp7hrann`
- **Endpoints**: `https://auth.openai.com/api/accounts/deviceauth/usercode`, token exchange via `https://auth.openai.com/oauth/token`
- **Flow**: Device code -> id_token -> access_token exchange
- **Key files**: `ogre-desktop/src/lib/oauth.ts` (`startChatGPTDeviceFlow`)

### Server Handshake Token
- **Purpose**: Authenticates desktop app to grading server (prevents unauthorized access)
- **Storage**: Generated UUID in `ogre-server.json`
- **Validation**: `x-handshake-token` header on all `/internal/*` and some API routes
- **Key files**: `grading-server/server.js`, `grading-server/config.js`

### Session-Based Automation Auth
- **Purpose**: Time-limited sessions for browser automation grants
- **Storage**: In-memory Map with expiration (1 hour default)
- **Key files**: `grading-server/automation.js`

## Storage

### SQLite (better-sqlite3)
- **Location**: Electron app userData directory
- **Mode**: WAL journal mode
- **Tables** (from `ogre-desktop/electron-main/database.ts`):
  - `provider_configs` -- AI provider connection settings
  - `grading_sessions` -- historical grading run statistics
  - `app_settings` -- key-value app configuration
  - `site_credentials` -- stored site login credentials
  - `response_embeddings` -- vector embeddings of graded responses (BLOB storage)
  - `site_profiles` -- knowledge profiles for automation targets
  - `oauth_tokens` -- persisted OAuth access/refresh tokens
- **Access**: Electron main process via IPC bridge (`ogre-desktop/src/lib/db.ts`)

### JSON File Storage
- `ogre-server.json` -- provider configs and handshake token (`grading-server/config.js`)
- `ogre-rubrics.json` -- saved rubric library (`grading-server/rubric-store.js`)
- **Location**: Platform-specific app data dir (`%APPDATA%/ogre-desktop` on Windows, `~/.config/ogre-desktop` on Linux)

### HuggingFace Model Cache
- **Location**: `~/.cache/ogre/models/Xenova/all-MiniLM-L6-v2/`
- **Contents**: `tokenizer.json`, `tokenizer_config.json`, `onnx/model_quantized.onnx`
- **Key files**: `grading-server/local-embedder.js`

### CDP Port File
- **Location**: `~/.ogre/cdp-port`
- **Purpose**: Advertises the CDP debugging port for external tool discovery
- **Key files**: `ogre-desktop/electron-main/cdp-bridge.ts`
