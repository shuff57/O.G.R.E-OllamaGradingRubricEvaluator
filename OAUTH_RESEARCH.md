# OAuth Support for AI Providers - Research Summary

## Executive Summary

**TL;DR**: Most AI providers do NOT support OAuth for API access. API keys are intentional design choices for cost control, security, and simplicity.

---

## Provider-by-Provider Analysis

### ❌ Anthropic Claude
**OAuth Status**: Not available  
**Authentication Method**: API keys only  
**Why No OAuth**:
- Anthropic is focused on API key simplicity
- No plans for OAuth announced
- API keys allow per-key rate limits and billing control

**What Users Must Do**:
1. Go to https://console.anthropic.com/
2. Create API key
3. Paste into extension

**Developer Opinion**: This is intentional. Anthropic wants direct billing relationship with users.

---

### ❌ OpenAI
**OAuth Status**: Available for identity, NOT for API access  
**Authentication Method**: API keys for API access  
**Confusing Part**: OpenAI HAS OAuth, but it's for "Sign in with OpenAI" (user profile access), NOT for making API calls

**OpenAI OAuth Scopes** (what they actually provide):
- `openid` - User identity
- `profile` - User profile data
- `email` - User email

**What's Missing**: No scope for `api:access` or similar

**What Users Must Do**:
1. Go to https://platform.openai.com/api-keys
2. Create API key
3. Paste into extension

**Why This Design**:
- OpenAI wants users to have individual accounts with billing
- API keys can be scoped (e.g., read-only, specific models)
- Prevents third-party apps from racking up charges on user's behalf

---

### ✅ Google Gemini (OAuth Available!)
**OAuth Status**: Fully supported  
**Authentication Method**: OAuth 2.0 OR API keys  
**Required Scope**: `https://www.googleapis.com/auth/generative-language.retriever`

**How OAuth Works**:
1. Create Google Cloud Project
2. Enable Generative Language API
3. Configure OAuth consent screen
4. Get OAuth Client ID
5. Use `chrome.identity.launchWebAuthFlow()` in extension

**User Experience**:
1. Click "Sign in with Google"
2. Google consent screen appears
3. User approves access
4. Extension receives access token
5. Token auto-refreshes

**Pros**:
- ✅ No manual API key copying
- ✅ Familiar "Sign in with Google" flow
- ✅ Token refresh handled automatically
- ✅ Free tier: 15 requests/min

**Cons**:
- ⚠️ You (developer) must create Google Cloud project
- ⚠️ OAuth client ID must be public in extension
- ⚠️ Users still need Google account

---

### ⚠️ GitHub Models
**OAuth Status**: Partial (Personal Access Tokens)  
**Authentication Method**: GitHub PAT (what you already implemented)  
**Alternative**: OAuth Device Flow (requires backend server)

**Current Implementation**: ✅ Already working with PAT  
**Limitation**: Still limited models (no Copilot models via API)

---

## Chrome Extension OAuth Implementation

### Required Permissions (`manifest.json`):
```json
{
  "permissions": ["identity"],
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": ["https://www.googleapis.com/auth/generative-language.retriever"]
  }
}
```

### Using `chrome.identity` API:
```javascript
chrome.identity.launchWebAuthFlow({
  url: 'https://accounts.google.com/o/oauth2/v2/auth?...',
  interactive: true
}, (redirectUrl) => {
  // Extract access token from redirectUrl
});
```

### Security Considerations:
- ✅ OAuth tokens stored in `chrome.storage.local` (encrypted by Chrome)
- ✅ Same security as API keys
- ✅ Can be revoked by user at accounts.google.com/permissions
- ⚠️ OAuth client ID is public (embedded in extension)
- ⚠️ Client secret should NEVER be in extension (use PKCE flow)

---

## Why Most Providers Use API Keys

### Industry Perspective:

**API Keys Are Better For**:
1. **Cost Control** - User pays for their own usage
2. **Scoping** - Can limit permissions per key
3. **Revocation** - Easy to revoke without affecting other apps
4. **Simplicity** - No OAuth server infrastructure needed
5. **Billing** - Direct relationship between provider and user

**OAuth Is Better For**:
1. **Consumer Apps** - "Sign in with X" experience
2. **Delegated Access** - App acts on behalf of user
3. **Integrated Services** - Provider controls both identity and API (like GitHub Copilot)

---

## Comparison with VS Code GitHub Copilot

### Why VS Code Can Use OAuth:

| Factor | VS Code/GitHub Copilot | Your Extension |
|--------|----------------------|----------------|
| **Provider** | GitHub (owns everything) | Third-party APIs |
| **Backend** | Microsoft servers | No backend |
| **Token Exchange** | Server-side | Client-side only |
| **Billing** | GitHub subscription | User's API account |
| **Service Integration** | First-party | Third-party |

**Key Difference**: VS Code connects to GitHub's services (which they own), while you're connecting to external third-party APIs.

---

## Recommended Solutions

### **Option 1: Keep API Keys (Anthropic, OpenAI)**
**Reason**: No OAuth alternative exists  
**Improvement**: Better UX around key entry
- ✅ "Get API Key" quick links
- ✅ Visual guides with screenshots
- ✅ Instant connection testing
- ✅ Secure storage (already implemented)

### **Option 2: Add Google OAuth (Gemini Only)**
**Reason**: Google supports it natively  
**Implementation**: I've created `google-oauth.js` for you  
**Benefit**: "Sign in with Google" button for Gemini users

**Requires**:
1. Google Cloud project setup (developer side)
2. OAuth client ID
3. Add `identity` permission to manifest
4. Implement sign-in button in UI

### **Option 3: Hybrid Approach (Recommended)**
**Offer both**:
- **Google Gemini**: "Sign in with Google" (OAuth)
- **Anthropic, OpenAI, Ollama**: API key entry (no alternative)

This gives users the best experience each provider allows.

---

## What Other Extensions Do

### Popular Chrome Extensions with AI:

1. **ChatGPT for Chrome** - Requires OpenAI API key (no OAuth)
2. **Notion AI** - Uses Notion OAuth (they control the service)
3. **Grammarly** - Uses Grammarly OAuth (first-party)
4. **Jasper** - Requires Jasper API key (third-party)

**Pattern**: Third-party AI APIs = API keys. First-party services = OAuth.

---

## Implementation Effort

### If You Want OAuth for Google:

**Time Estimate**: 2-3 hours  
**Steps**:
1. Create Google Cloud project (10 min)
2. Enable Generative Language API (5 min)
3. Configure OAuth consent screen (15 min)
4. Add `identity` permission to manifest (1 min)
5. Implement sign-in button UI (30 min)
6. Test OAuth flow (30 min)
7. Handle token refresh (30 min)
8. Update README with setup instructions (30 min)

**Result**: Users can click "Sign in with Google" for Gemini access (no API key needed).

---

## Final Recommendation

### **For Your Use Case (Grading Extension)**:

**Recommended**: Keep API keys with improved UX

**Why**:
- ✅ Your users are educators (tech-savvy enough to get API keys)
- ✅ API keys work for ALL providers (not just Google)
- ✅ Simpler codebase (no OAuth infrastructure)
- ✅ Better for cost control (school/district pays per account)
- ✅ Already implemented and working

**Optional Addition**: Add Google OAuth later if users specifically request easier Gemini access.

**UX Improvements to Make**:
1. Add "Get API Key" buttons next to each provider tab
2. Add visual guide (collapsible) showing where to find keys
3. Show connection status (green checkmark when connected)
4. Remember last used provider (don't make users re-select)
5. Add key masking (show first/last 4 chars only)

---

## Code Already Provided

I've created `google-oauth.js` for you if you want to add Google Sign-In support for Gemini. To use it:

1. Get OAuth Client ID from Google Cloud Console
2. Add to `manifest.json`: `"permissions": ["identity"]`
3. Import in `providers.js`
4. Modify Gemini provider to use OAuth token instead of API key

Let me know if you want me to implement this fully or stick with API keys + better UX.
