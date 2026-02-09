# Testing Guide for UX Improvements

## Pre-Test Setup

### 1. Reload Extension
```
1. Go to chrome://extensions/
2. Find "O.G.R.E-OllamaGradingRubricEvaluator"
3. Click the reload icon (circular arrow)
```

### 2. Open Extension
```
1. Click the extension icon in Chrome toolbar
2. Sidepanel should open on the right
```

---

## Test 1: Provider Tab Status Indicators

### Test Case 1.1: Unconfigured Provider
**Steps**:
1. Look at provider tabs (Ollama, Local, OpenAI, Claude, Gemini, GitHub)
2. Note which tabs have colored dots in top-right corner

**Expected**:
- Providers you haven't configured = No dot
- Providers with saved API keys = Small green dot (🟢)

---

## Test 2: "Get API Key" Links

### Test Case 2.1: Anthropic Claude
**Steps**:
1. Click "Claude" tab
2. Look for "🔗 Get API Key" link next to "API Key" label
3. Click the link

**Expected**:
- New tab opens to: `https://console.anthropic.com/settings/keys`

### Test Case 2.2: Google Gemini
**Steps**:
1. Click "Gemini" tab
2. Click "🔗 Get API Key" link

**Expected**:
- New tab opens to: `https://aistudio.google.com/app/apikey`

### Test Case 2.3: OpenAI
**Steps**:
1. Click "OpenAI" tab
2. Click "🔗 Get API Key" link

**Expected**:
- New tab opens to: `https://platform.openai.com/api-keys`

---

## Test 3: API Key Masking

### Test Case 3.1: Paste and Mask
**Steps**:
1. Click "Claude" tab (or any provider)
2. Paste this test key: `sk-ant-test123456789abcdefghijklmnop`
3. Click outside the input field (blur)
4. Observe the field value

**Expected**:
- Value changes to: `sk-ant-●●●●●●●●nop` (or similar masked format)
- Only first ~7 chars and last 3 chars visible

### Test Case 3.2: Reveal on Focus
**Steps**:
1. Click back into the API key field
2. Observe the value

**Expected**:
- Full unmasked key appears: `sk-ant-test123456789abcdefghijklmnop`

### Test Case 3.3: Re-mask on Blur
**Steps**:
1. Click outside the field again

**Expected**:
- Key masks again: `sk-ant-●●●●●●●●nop`

---

## Test 4: Auto-Test Connection

### Test Case 4.1: Valid Key (Anthropic)
**Steps**:
1. Click "Claude" tab
2. If you have a real Anthropic API key, paste it
3. Click outside field
4. Wait ~2 seconds

**Expected**:
- Tab shows yellow pulsing dot (🟡) briefly
- Status message appears: "🔄 Testing connection..."
- After test completes:
  - ✅ Green message: "Connected successfully" (if key is valid)
  - Tab dot turns green (🟢)
  - Message disappears after 3 seconds

### Test Case 4.2: Invalid Key
**Steps**:
1. Paste an invalid key: `sk-ant-invalid12345`
2. Wait ~2 seconds

**Expected**:
- Yellow pulsing dot → Red dot (🔴)
- ❌ Red message: "401 Unauthorized. Check your API Key." (or similar)
- Message persists (doesn't auto-hide)

---

## Test 5: Manual Test Button

### Test Case 5.1: Manual Test
**Steps**:
1. Look below the API key field
2. Click "🔄 Test Connection" button

**Expected**:
- Same behavior as auto-test:
  - Yellow pulsing dot while testing
  - Green/red dot + message when complete

---

## Test 6: Status Persistence

### Test Case 6.1: Close and Reopen
**Steps**:
1. Configure a provider (e.g., paste API key for Claude)
2. Wait for green dot to appear
3. Close the sidepanel (click outside or close button)
4. Reopen extension

**Expected**:
- Claude tab still has green dot (🟢)
- Last selected provider tab is active
- API key is still saved (masked)

---

## Test 7: Multi-Provider Status

### Test Case 7.1: Configure Multiple Providers
**Steps**:
1. Click "Claude" tab → paste API key → wait for green dot
2. Click "Gemini" tab → paste API key → wait for green dot
3. Click "OpenAI" tab → paste API key → wait for green dot
4. Look at all provider tabs

**Expected**:
- Claude tab: Green dot (🟢)
- Gemini tab: Green dot (🟢)
- OpenAI tab: Green dot (🟢)
- Unconfigured tabs: No dot

---

## Test 8: Error Handling

### Test Case 8.1: Network Error (Offline)
**Steps**:
1. Disconnect internet
2. Paste API key
3. Wait for auto-test

**Expected**:
- Red dot (🔴) on tab
- ❌ Error message (network-related)

### Test Case 8.2: Empty Key
**Steps**:
1. Leave API key field empty
2. Click "Test Connection" button

**Expected**:
- Error message or no test (field validation)

---

## Test 9: Real API Test (If You Have Keys)

### Test Case 9.1: Anthropic Claude (Real Key)
**Setup**: Get real API key from https://console.anthropic.com/settings/keys

**Steps**:
1. Click "Claude" tab
2. Click "🔗 Get API Key" → create key in console
3. Copy real API key
4. Paste into extension
5. Wait for auto-test
6. Select model from dropdown (e.g., "Claude Sonnet 4.5")
7. Try grading something with a simple rubric

**Expected**:
- ✅ Connection successful
- Models populate in dropdown
- Grading works

### Test Case 9.2: Google Gemini (Real Key - FREE)
**Setup**: Get free API key from https://aistudio.google.com/app/apikey

**Steps**:
1. Click "Gemini" tab
2. Get API key from Google AI Studio
3. Paste into extension
4. Wait for auto-test
5. Select model (e.g., "Gemini 1.5 Flash")
6. Try grading

**Expected**:
- ✅ Connection successful
- Multiple Gemini models in dropdown
- Grading works (free tier: 15 req/min)

---

## Test 10: UI Regression Check

### Test Case 10.1: Existing Features Still Work
**Steps**:
1. Test rubric text input
2. Test rubric table
3. Test screenshot capture
4. Test model selection
5. Test "Run Assessment" button

**Expected**:
- All existing features work as before
- No broken functionality

---

## Common Issues & Solutions

### Issue 1: "Get API Key" link doesn't work
**Solution**: Check browser console for errors. Ensure `chrome.tabs.create` permission exists.

### Issue 2: Status indicator doesn't appear
**Solution**: Check browser DevTools → Elements → Inspect `.tab-btn::after` pseudo-element

### Issue 3: Auto-test doesn't trigger
**Solution**: Check that input is long enough (>10 chars) and field is not masked when typing

### Issue 4: Key not saving
**Solution**: Check `chrome.storage.local` in DevTools → Application → Storage

---

## Developer Testing (Console)

### Check Stored Configuration
```javascript
chrome.storage.local.get('providerConfigs', (result) => {
  console.log(result.providerConfigs);
});
```

### Manually Trigger Test
```javascript
// In extension context (not content page)
testConnection('anthropic');
```

### Check Provider URLs
```javascript
console.log(PROVIDER_KEY_URLS);
```

---

## Success Criteria

All tests pass if:
- ✅ Status indicators appear and update correctly
- ✅ "Get API Key" links open correct provider pages
- ✅ API keys mask/unmask on focus/blur
- ✅ Auto-test triggers after pasting key
- ✅ Manual test button works
- ✅ Status persists across sessions
- ✅ Multiple providers can be configured
- ✅ Error messages display correctly
- ✅ Real API connections work (if you have keys)

---

## Reporting Issues

If any test fails, provide:
1. Test case number (e.g., "Test 3.1 failed")
2. What you expected
3. What actually happened
4. Browser console errors (if any)
5. Screenshot (if visual issue)
