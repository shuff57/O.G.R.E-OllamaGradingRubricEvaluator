/**
 * oauth-client.js - Frontend OAuth Handler for Chrome Extension
 * 
 * This handles OAuth flows that require a backend server.
 * Uses chrome.identity.launchWebAuthFlow() with the extension's own redirect URL.
 * The extension captures the auth code, then POSTs it to the backend for token exchange.
 */

// TODO: Replace with your actual Vercel deployment URL
const OAUTH_BACKEND_URL = 'https://ogre-oauth-backend.vercel.app';

/**
 * Canonical storage keys for OAuth tokens.
 * 
 * Google OAuth: googleOAuthToken, googleRefreshToken, googleTokenExpiry
 * GitHub OAuth: githubOAuthToken, githubTokenType
 */
const STORAGE_KEYS = {
  GITHUB_TOKEN: 'githubOAuthToken',
  GITHUB_TOKEN_TYPE: 'githubTokenType',
  GOOGLE_TOKEN: 'googleOAuthToken',
  GOOGLE_REFRESH_TOKEN: 'googleRefreshToken',
  GOOGLE_TOKEN_EXPIRY: 'googleTokenExpiry',
};

/**
 * proxyFetch - Routes fetch calls through the background service worker.
 * This avoids CORS issues from the sidepanel/popup context.
 * Mirrors the proxyFetch in sidepanel.js.
 */
function proxyFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      reject(new Error('Extension API not found.'));
      return;
    }

    const timeoutId = setTimeout(() => {
      reject(new Error('Request timed out - the API did not respond in time'));
    }, 130000);

    chrome.runtime.sendMessage({
      action: 'proxyFetch',
      url: url,
      options: options,
    }, (response) => {
      clearTimeout(timeoutId);

      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response) {
        reject(new Error('No response from background service worker'));
      } else if (response.error) {
        reject(new Error(response.error));
      } else {
        resolve({
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          text: () => Promise.resolve(response.data),
          json: () => Promise.resolve(JSON.parse(response.data)),
        });
      }
    });
  });
}

/**
 * GitHub OAuth Flow (with backend)
 * 
 * Flow: GitHub redirects to extension URL -> extension captures code ->
 *       extension POSTs code to backend -> backend exchanges for token
 */
export async function signInWithGitHub() {
  const GITHUB_CLIENT_ID = 'YOUR_GITHUB_CLIENT_ID'; // Public ID (safe to expose)
  
  // Step 1: Open GitHub OAuth consent screen
  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
  authUrl.searchParams.set('scope', 'repo user');
  authUrl.searchParams.set('redirect_uri', chrome.identity.getRedirectURL('github'));
  authUrl.searchParams.set('state', crypto.randomUUID()); // CSRF protection
  
  return new Promise((resolve, reject) => {
    // Step 2: Launch OAuth flow in browser
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl.toString(),
        interactive: true,
      },
      async (redirectUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        // Step 3: Extract auth code from redirect
        const params = new URL(redirectUrl).searchParams;
        const code = params.get('code');
        
        if (!code) {
          reject(new Error('No authorization code returned'));
          return;
        }
        
        try {
          // Step 4: Send code to backend to exchange for token
          const response = await proxyFetch(`${OAUTH_BACKEND_URL}/api/auth/github/callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          });
          
          const data = await response.json();
          
          if (data.success) {
            // Step 5: Store token securely
            await chrome.storage.local.set({
              [STORAGE_KEYS.GITHUB_TOKEN]: data.access_token,
              [STORAGE_KEYS.GITHUB_TOKEN_TYPE]: data.token_type,
            });
            
            resolve(data.access_token);
          } else {
            reject(new Error(data.error || 'Failed to get access token'));
          }
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

/**
 * Google OAuth Flow (with backend) - For Gemini API
 * 
 * Flow: Google redirects to extension URL -> extension captures code ->
 *       extension POSTs code to backend -> backend exchanges for token
 * 
 * Uses access_type=offline to obtain refresh tokens.
 */
export async function signInWithGoogle() {
  const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
  
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', chrome.identity.getRedirectURL('google'));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/generative-language.retriever');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', crypto.randomUUID());
  
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl.toString(),
        interactive: true,
      },
      async (redirectUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        const params = new URL(redirectUrl).searchParams;
        const code = params.get('code');
        
        if (!code) {
          reject(new Error('No authorization code returned'));
          return;
        }
        
        try {
          const response = await proxyFetch(`${OAUTH_BACKEND_URL}/api/auth/google/callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          });
          
          const data = await response.json();
          
          if (data.success) {
            await chrome.storage.local.set({
              [STORAGE_KEYS.GOOGLE_TOKEN]: data.access_token,
              [STORAGE_KEYS.GOOGLE_REFRESH_TOKEN]: data.refresh_token,
              [STORAGE_KEYS.GOOGLE_TOKEN_EXPIRY]: Date.now() + (data.expires_in * 1000),
            });
            
            resolve(data.access_token);
          } else {
            reject(new Error(data.error || 'Failed to get access token'));
          }
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

/**
 * Refresh expired Google token
 */
export async function refreshGoogleToken() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.GOOGLE_REFRESH_TOKEN);
  
  if (!stored[STORAGE_KEYS.GOOGLE_REFRESH_TOKEN]) {
    throw new Error('No refresh token available');
  }
  
  const response = await proxyFetch(`${OAUTH_BACKEND_URL}/api/auth/google/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: stored[STORAGE_KEYS.GOOGLE_REFRESH_TOKEN] }),
  });
  
  const data = await response.json();
  
  if (data.success) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.GOOGLE_TOKEN]: data.access_token,
      [STORAGE_KEYS.GOOGLE_TOKEN_EXPIRY]: Date.now() + (data.expires_in * 1000),
    });
    
    return data.access_token;
  } else {
    throw new Error(data.error || 'Failed to refresh token');
  }
}

/**
 * Get valid Google token (refresh if expired)
 */
export async function getGoogleToken() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.GOOGLE_TOKEN,
    STORAGE_KEYS.GOOGLE_TOKEN_EXPIRY,
    STORAGE_KEYS.GOOGLE_REFRESH_TOKEN,
  ]);
  
  // Check if token exists and is not expired
  if (stored[STORAGE_KEYS.GOOGLE_TOKEN] && stored[STORAGE_KEYS.GOOGLE_TOKEN_EXPIRY] > Date.now()) {
    return stored[STORAGE_KEYS.GOOGLE_TOKEN];
  }
  
  // Token expired or doesn't exist, try to refresh
  if (stored[STORAGE_KEYS.GOOGLE_REFRESH_TOKEN]) {
    return await refreshGoogleToken();
  }
  
  // No token at all, need to sign in
  throw new Error('Not signed in. Please sign in with Google.');
}

/**
 * Sign out and revoke tokens
 */
export async function signOut(provider) {
  if (provider === 'github') {
    await chrome.storage.local.remove([
      STORAGE_KEYS.GITHUB_TOKEN,
      STORAGE_KEYS.GITHUB_TOKEN_TYPE,
    ]);
  } else if (provider === 'google') {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.GOOGLE_TOKEN);
    
    // Revoke token with Google
    if (stored[STORAGE_KEYS.GOOGLE_TOKEN]) {
      try {
        await proxyFetch(`https://oauth2.googleapis.com/revoke?token=${stored[STORAGE_KEYS.GOOGLE_TOKEN]}`, {
          method: 'POST',
        });
      } catch {
        // Best-effort revocation; don't block sign-out if it fails
      }
    }
    
    await chrome.storage.local.remove([
      STORAGE_KEYS.GOOGLE_TOKEN,
      STORAGE_KEYS.GOOGLE_REFRESH_TOKEN,
      STORAGE_KEYS.GOOGLE_TOKEN_EXPIRY,
    ]);
  }
}
