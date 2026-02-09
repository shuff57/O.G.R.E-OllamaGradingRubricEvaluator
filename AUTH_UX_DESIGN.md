# Authentication UX Design - O.G.R.E Extension

## Design Philosophy
Since OAuth isn't available for most AI providers, we'll make API key entry as frictionless as possible while adding OAuth for Google Gemini (the only provider that supports it).

## User Experience Flow

### First-Time Setup (Per Provider)
1. User clicks provider tab (e.g., "Claude")
2. Sees empty API key field with helper elements:
   - 🔗 "Get API Key" link (opens provider's key page)
   - ℹ️ Info icon (shows visual guide)
   - ✅ Connection status indicator
3. User clicks "Get API Key" → Opens in new tab
4. User creates/copies key → Pastes into extension
5. Extension auto-tests connection → Shows ✅ or ❌
6. Key saved securely → Never asked again

### Returning User Experience
1. User opens extension → Last provider remembered
2. Connection status shown immediately (✅ Connected)
3. Model dropdown populated automatically
4. Ready to grade (no re-authentication)

### Google Gemini (Special Case)
**Option A**: API key (same as others)
**Option B**: "Sign in with Google" button (OAuth)

Users can choose whichever they prefer.

---

## UI Components

### 1. Provider Tab Enhancement
Each provider tab shows connection status:
```
[Ollama Cloud ✅] [Local ❌] [OpenAI ✅] [Claude ⚠️] [Gemini ✅] [GitHub ❌]
```

Status icons:
- ✅ Green checkmark = Connected & tested
- ❌ Red X = Not configured
- ⚠️ Yellow warning = Configured but needs retest
- 🔄 Spinner = Testing connection

### 2. API Key Input Enhancement
Before:
```
[API Key: _______________]
```

After:
```
[API Key: ●●●●●●●●●●●xyz] [🔗 Get API Key] [ℹ️] [🔄 Test]
                                               ↳ Opens guide modal
```

### 3. Connection Status Card
```
┌─────────────────────────────────────┐
│ 🟢 Connected as: user@example.com   │ ← For OAuth providers
│ ✅ Last tested: 2 minutes ago       │
│ [Disconnect] [Re-test]              │
└─────────────────────────────────────┘
```

Or:
```
┌─────────────────────────────────────┐
│ 🟢 API Key: sk-ant-...xyz           │ ← For API key providers
│ ✅ Connection verified              │
│ [Change Key] [Re-test]              │
└─────────────────────────────────────┘
```

### 4. Setup Guide Modal (Per Provider)
Triggered by ℹ️ icon:
```
┌─────────────────────────────────────┐
│ How to Get Your Claude API Key      │
│                                     │
│ 1. Visit console.anthropic.com      │
│    [Open in New Tab →]              │
│                                     │
│ 2. Click "Create API Key"           │
│    📸 [Screenshot showing location] │
│                                     │
│ 3. Copy the key                     │
│    📸 [Screenshot of key]           │
│                                     │
│ 4. Paste here and click Test        │
│                                     │
│ [Close]                             │
└─────────────────────────────────────┘
```

---

## Technical Implementation

### Storage Schema
```javascript
{
  // Current provider
  activeProvider: 'anthropic',
  
  // Provider configurations
  providers: {
    'anthropic': {
      apiKey: 'sk-ant-...', // Encrypted by chrome.storage
      model: 'claude-sonnet-4-20250514',
      lastTested: 1707423600000,
      status: 'connected' // 'connected' | 'error' | 'unconfigured'
    },
    'google-gemini': {
      authMethod: 'oauth', // 'oauth' | 'apikey'
      oauthToken: 'ya29...', // If using OAuth
      apiKey: 'AIza...', // If using API key
      model: 'gemini-1.5-pro',
      lastTested: 1707423600000,
      status: 'connected',
      userEmail: 'user@gmail.com' // For OAuth display
    },
    // ... other providers
  }
}
```

### API Key Masking Function
```javascript
function maskApiKey(key) {
  if (!key || key.length < 8) return '●●●●●●●●';
  const prefix = key.substring(0, 7); // Show prefix (e.g., "sk-ant-")
  const suffix = key.slice(-3); // Show last 3 chars
  return `${prefix}...${suffix}`;
}
```

### Auto-Test on Input
```javascript
// When user pastes API key, test immediately
apiKeyInput.addEventListener('input', debounce(async (e) => {
  const key = e.target.value;
  if (key.length > 10) { // Looks like a valid key
    showStatus('testing');
    const result = await testConnection({ apiKey: key });
    showStatus(result.ok ? 'connected' : 'error', result.error);
  }
}, 1000));
```

---

## Provider-Specific URLs

### Direct "Get API Key" Links
```javascript
const PROVIDER_URLS = {
  'anthropic': 'https://console.anthropic.com/settings/keys',
  'openai': 'https://platform.openai.com/api-keys',
  'google-gemini': 'https://aistudio.google.com/app/apikey',
  'github-models': 'https://github.com/settings/tokens/new',
  'ollama-cloud': null, // User provides their own endpoint
};
```

---

## Visual Design Mockup

```
┌────────────────────────────────────────────────────────────┐
│  Config                                                     │
├────────────────────────────────────────────────────────────┤
│  [Ollama] [Local] [OpenAI] [Claude✅] [Gemini] [GitHub]    │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ 🟢 Connected                                          │ │
│  │ API Key: sk-ant-...xyz    [Change] [Re-test]         │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Need an API key? [Get API Key →] [ℹ️ Setup Guide]        │
│                                                            │
│  AI Model: [Claude Sonnet 4.5 ▼]                          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Google OAuth UI (Optional)

For Gemini provider only:
```
┌────────────────────────────────────────────────────────────┐
│  Gemini                                                     │
├────────────────────────────────────────────────────────────┤
│  Choose authentication method:                              │
│                                                            │
│  ⚪ [Sign in with Google]  ← OAuth (recommended)           │
│     No API key needed, instant setup                       │
│                                                            │
│  ⚪ API Key                 ← Manual setup                  │
│     [_______________]  [Get API Key →] [ℹ️]                │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

After OAuth sign-in:
```
┌────────────────────────────────────────────────────────────┐
│  🟢 Signed in as user@gmail.com                            │
│  ✅ Connected via Google OAuth                             │
│  [Sign Out]                                                │
└────────────────────────────────────────────────────────────┘
```

---

## Implementation Priority

### Phase 1: Core UX Improvements (Implement Now)
1. ✅ Connection status indicators
2. ✅ "Get API Key" quick links
3. ✅ API key masking
4. ✅ Auto-test on input
5. ✅ Remember last provider
6. ✅ Setup guide modals

### Phase 2: Google OAuth (Optional)
1. ⏸️ Add `identity` permission to manifest
2. ⏸️ Implement OAuth flow using `google-oauth.js`
3. ⏸️ Add "Sign in with Google" button to Gemini tab
4. ⏸️ Handle token refresh

**Decision**: Implement Phase 1 now. Phase 2 only if users request easier Gemini access.

---

## Design Complete ✓

This design provides:
- ✅ Minimal friction for API key entry
- ✅ Clear visual feedback (connection status)
- ✅ Contextual help (setup guides, direct links)
- ✅ Security (key masking, encrypted storage)
- ✅ Future-proof (OAuth ready for Gemini if needed)

Proceeding to implementation...
