# GitHub Token Setup (Manual - Simple)

## Quick Setup (3 Steps)

### Step 1: Create GitHub Personal Access Token

1. Visit: **https://github.com/settings/tokens/new**
2. Fill in:
   - **Note**: `O.G.R.E Grading Assistant`
   - **Expiration**: Choose your preference (30 days, 90 days, or no expiration)
   - **Scopes**: Check these boxes:
     - ✅ `repo` (Full control of private repositories)
     - ✅ `user` (Read user profile data)
3. Click **"Generate token"** at the bottom
4. **Copy the token** (starts with `ghp_` or `github_pat_`)
   - ⚠️ **Important**: You won't be able to see it again!

### Step 2: Add Token to Extension

1. Open the O.G.R.E extension side panel
2. Find the **"GitHub Integration"** section
3. Paste your token into the input field
4. Click **"Save Token"**
5. You should see a success message with your GitHub username

### Step 3: Verify Connection

You should now see:
- ✅ Your GitHub avatar
- ✅ Your username
- ✅ "Connected" status

---

## Using the Token in Code

Once authenticated, your token is available throughout the extension:

```javascript
// In sidepanel.js or any other script
const token = window.githubAuth.token;

// Example: Fetch user repositories
const response = await fetch('https://api.github.com/user/repos', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json'
  }
});

const repos = await response.json();
console.log('My repos:', repos);
```

---

## Security Notes

- ✅ Token is stored locally in Chrome's storage (encrypted)
- ✅ Token never leaves your computer
- ✅ You can revoke tokens anytime at: https://github.com/settings/tokens
- ⚠️ Never share your token with anyone
- ⚠️ Treat tokens like passwords

---

## Troubleshooting

### "Invalid token" error
- Make sure you copied the entire token (starts with `ghp_` or `github_pat_`)
- Check that you granted the correct scopes (`repo` and `user`)
- Verify token hasn't expired

### "Failed to fetch user info"
- Check your internet connection
- Verify the token is still valid at: https://github.com/settings/tokens
- Token might have been revoked

### Need to change token?
1. Click **"Sign Out"** in the extension
2. Generate a new token at GitHub
3. Follow setup steps again

---

## Revoking Access

To remove GitHub access from the extension:

1. Click **"Sign Out"** in the extension
2. (Optional) Revoke the token on GitHub: https://github.com/settings/tokens
