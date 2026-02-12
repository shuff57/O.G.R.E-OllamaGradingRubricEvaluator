import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-shell";
import { saveOAuthToken, getOAuthToken, deleteOAuthToken, type OAuthToken } from "./db";

// Use the existing Vercel backend
const OAUTH_BACKEND_URL = "https://ogre-oauth-backend.vercel.app";

// Placeholders - user should replace these with actual Client IDs
const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"; 
const GITHUB_CLIENT_ID = "YOUR_GITHUB_CLIENT_ID";

// Redirect URIs must match what is registered in the OAuth provider
const GOOGLE_REDIRECT_URI = "ogre://oauth/callback/google";
const GITHUB_REDIRECT_URI = "ogre://oauth/callback/github";

export async function signInWithGoogle(): Promise<string> {
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/generative-language.retriever');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  
  const state = crypto.randomUUID();
  authUrl.searchParams.set('state', state);

  await open(authUrl.toString());

  return new Promise<string>((resolve, reject) => {
    // Timeout to prevent hanging listener
    const timeout = setTimeout(() => {
        unlisten.then(u => u());
        reject(new Error("Timeout waiting for OAuth callback"));
    }, 300000); // 5 minutes

    const unlisten = listen<string>("oauth-callback", async (event) => {
      const urlStr = event.payload;
      try {
        const url = new URL(urlStr);
        
        // Verify it's for google
        if (!url.pathname.includes("google")) return; 

        clearTimeout(timeout);

        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");

        if (returnedState !== state) {
           console.warn("State mismatch in OAuth callback");
        }

        if (!code) {
           throw new Error("No code found in callback");
        }

        // Exchange Code for Token via Backend
        const response = await fetch(`${OAUTH_BACKEND_URL}/api/auth/google/callback`, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ 
               code,
               redirect_uri: GOOGLE_REDIRECT_URI 
           })
        });

        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || "Failed to exchange token");
        }

        await saveOAuthToken({
            provider: "google",
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: Date.now() + (data.expires_in * 1000),
            token_type: "Bearer"
        });

        resolve(data.access_token);
        unlisten.then(u => u()); 
      } catch (err) {
        reject(err);
        unlisten.then(u => u());
      }
    });
  });
}

export async function signInWithGitHub(): Promise<string> {
  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', GITHUB_REDIRECT_URI);
  authUrl.searchParams.set('scope', 'repo user');
  authUrl.searchParams.set('state', crypto.randomUUID());

  await open(authUrl.toString());

  return new Promise<string>((resolve, reject) => {
     const timeout = setTimeout(() => {
        unlisten.then(u => u());
        reject(new Error("Timeout waiting for OAuth callback"));
    }, 300000);

     const unlisten = listen<string>("oauth-callback", async (event) => {
        const urlStr = event.payload;
        try {
            const url = new URL(urlStr);
            if (!url.pathname.includes("github")) return;

            clearTimeout(timeout);
            
            const code = url.searchParams.get("code");
            if (!code) {
                throw new Error("No code found");
            }

            const response = await fetch(`${OAUTH_BACKEND_URL}/api/auth/github/callback`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code }) 
            });

            const data = await response.json();
            if (!data.success) throw new Error(data.error);

            await saveOAuthToken({
                provider: "github",
                access_token: data.access_token,
                token_type: data.token_type
            });

            resolve(data.access_token);
            unlisten.then(u => u());
        } catch (err) {
            reject(err);
            unlisten.then(u => u());
        }
     });
  });
}

export async function signOut(provider: "google" | "github"): Promise<void> {
    const token = await getOAuthToken(provider);
    if (provider === "google" && token?.access_token) {
        try {
            await fetch(`https://oauth2.googleapis.com/revoke?token=${token.access_token}`, {
                method: "POST"
            });
        } catch (e) {
            console.warn("Revoke failed", e);
        }
    }
    await deleteOAuthToken(provider);
}

export async function fetchAvailableModels(provider: "google" | "github"): Promise<string[]> {
    const tokenData = await getOAuthToken(provider);
    if (!tokenData) throw new Error("Not signed in");

    let accessToken = tokenData.access_token;

    // Refresh if needed (Google only)
    if (provider === "google" && tokenData.expires_at && Date.now() > tokenData.expires_at) {
        if (!tokenData.refresh_token) throw new Error("Token expired and no refresh token");
        
        const response = await fetch(`${OAUTH_BACKEND_URL}/api/auth/google/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: tokenData.refresh_token })
        });
        
        const data = await response.json();
        if (!data.success) throw new Error("Refresh failed");
        
        accessToken = data.access_token;
        await saveOAuthToken({
            ...tokenData,
            access_token: accessToken,
            expires_at: Date.now() + (data.expires_in * 1000)
        });
    }

    if (provider === "google") {
        const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok) throw new Error("Failed to fetch models");
        const json = await res.json();
        return json.models?.map((m: any) => m.name.replace("models/", "")) || [];
    } else {
        // GitHub Models (Azure AI inference)
        const res = await fetch("https://models.github.ai/inference/v1/models", {
             headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok) throw new Error("Failed to fetch GitHub models");
        const json = await res.json();
        return json.data?.map((m: any) => m.id) || [];
    }
}
