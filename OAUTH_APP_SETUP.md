# OAuth App Registration Guide

This guide walks you through setting up the required OAuth applications for Google and GitHub, and configuring the Vercel backend for O.G.R.E.

---

## 1. Google Cloud Console Setup

1. **Create or Select Project**:
   - Go to the [Google Cloud Console](https://console.cloud.google.com/).
   - Click the project dropdown at the top and select an existing project or click **"New Project"**.

2. **Enable API**:
   - Go to **APIs & Services > Library**.
   - Search for **"Generative Language API"** and click **Enable**.

3. **Configure OAuth Consent Screen**:
   - Go to **APIs & Services > OAuth consent screen**.
   - Select **User Type: External** and click **Create**.
   - Fill in the required App information:
     - **App name**: `O.G.R.E Grading Assistant`
     - **User support email**: Your email address
     - **Developer contact information**: Your email address
   - Click **Save and Continue**.

4. **Add Scopes**:
   - Click **Add or Remove Scopes**.
   - Manually add the scope: `https://www.googleapis.com/auth/generative-language.retriever`
   - Click **Update** and then **Save and Continue**.

5. **Add Test Users**:
   - Add your own email address as a test user.
   - Click **Save and Continue**.

6. **Create Credentials**:
   - Go to **APIs & Services > Credentials**.
   - Click **+ Create Credentials > OAuth client ID**.
   - **Application type**: Web application.
   - **Name**: `O.G.R.E Extension Client`
   - **Authorized redirect URIs**:
     - Click **Add URI** and enter: `https://<extension-id>.chromiumapp.org/google`
     - *Replace `<extension-id>` with your stable extension ID.*
   - Click **Create**.

7. **Save Credentials**:
   - Copy the **Client ID** and **Client Secret**. You will need these for the Vercel setup.

---

## 2. GitHub OAuth App Setup

1. **Navigate to Developer Settings**:
   - Go to [GitHub Settings > Developer Settings > OAuth Apps](https://github.com/settings/developers).
   - Click **New OAuth App**.

2. **Register New Application**:
   - **Application name**: `O.G.R.E Grading`
   - **Homepage URL**: Your GitHub repository URL (e.g., `https://github.com/shuff/O.G.R.E-OllamaGradingReviewEvaluator`)
   - **Authorization callback URL**: `https://<extension-id>.chromiumapp.org/github`
     - *Replace `<extension-id>` with your stable extension ID.*

3. **Generate Secret**:
   - Click **Register application**.
   - On the next screen, click **Generate a new client secret**.
   - Copy the **Client ID** and **Client Secret**.

---

## 3. Vercel Environment Variables Setup

1. **Open Vercel Dashboard**:
   - Go to your project in the [Vercel Dashboard](https://vercel.com/dashboard).
   - Navigate to **Settings > Environment Variables**.

2. **Add Environment Variables**:
   Add the following keys and values obtained from the steps above:

   | Key | Value | Sensitive |
   |-----|-------|-----------|
   | `GOOGLE_CLIENT_ID` | Your Google Client ID | Yes |
   | `GOOGLE_CLIENT_SECRET` | Your Google Client Secret | Yes |
   | `GOOGLE_REDIRECT_URI` | `https://<extension-id>.chromiumapp.org/google` | No |
   | `GITHUB_CLIENT_ID` | Your GitHub Client ID | Yes |
   | `GITHUB_CLIENT_SECRET` | Your GitHub Client Secret | Yes |

3. **Security**:
   - Ensure all secrets are marked as **"Sensitive"** (or use Vercel's default secret protection).

---

## Appendix: Redirect URI Format

The extension uses the `chrome.identity` API, which requires redirect URIs to follow a specific format based on your extension ID:

`https://<your-extension-id>.chromiumapp.org/<provider>`

- **Google**: `https://<extension-id>.chromiumapp.org/google`
- **GitHub**: `https://<extension-id>.chromiumapp.org/github`

You can find your Extension ID on the `chrome://extensions` page after loading the unpacked extension. To ensure this ID remains stable, make sure your `manifest.json` includes a `"key"` field.
