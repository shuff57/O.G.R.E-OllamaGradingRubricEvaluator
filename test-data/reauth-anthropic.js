/**
 * Anthropic OAuth re-auth script.
 * Step 1: node test-data/reauth-anthropic.js         → opens browser
 * Step 2: node test-data/reauth-anthropic.js <code>  → exchanges code, updates ogre-server.json
 */
import crypto from 'crypto';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CLIENT_ID    = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const AUTH_URL     = 'https://claude.ai/oauth/authorize';
const TOKEN_URL    = 'https://console.anthropic.com/v1/oauth/token';
const REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
const SCOPE        = 'org:create_api_key user:profile user:inference';
const SERVER_JSON  = path.join(process.env.APPDATA, 'com.ogre.desktop', 'ogre-server.json');
const PKCE_FILE    = path.join(__dirname, 'reauth-pkce.json');

function generateCodeVerifier() {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.randomBytes(128);
  return Array.from(bytes, b => charset[b % charset.length]).join('');
}

function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

const code = process.argv[2];

if (!code) {
  // Step 1: generate PKCE + open browser
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = generateState();

  fs.writeFileSync(PKCE_FILE, JSON.stringify({ verifier, state }));

  const url = new URL(AUTH_URL);
  url.searchParams.set('code', 'true');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('state', state);

  const authUrlStr = url.toString();
  console.log('\n=== Anthropic Re-Auth: Step 1 ===');
  console.log('Opening browser...\n');

  const openCmd = `start "" "${authUrlStr}"`;
  exec(openCmd, (err) => {
    if (err) console.error('Could not open browser automatically:', err.message);
  });

  console.log('1. Approve in the browser window that just opened.');
  console.log('2. Anthropic will show you a code on screen — copy it.');
  console.log('3. Paste it here:\n');
  console.log('   node test-data/reauth-anthropic.js <paste-code-here>\n');

} else {
  // Step 2: exchange code for tokens
  if (!fs.existsSync(PKCE_FILE)) {
    console.error('ERROR: Run step 1 first (no PKCE file found)');
    process.exit(1);
  }

  const { verifier, state } = JSON.parse(fs.readFileSync(PKCE_FILE, 'utf8'));

  // Anthropic returns code as "{auth_code}#{state}" — strip the #state part
  const cleanCode = code.split('#')[0].trim();

  console.log('\n=== Anthropic Re-Auth: Step 2 — exchanging code ===\n');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code: cleanCode,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      state,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`Token exchange failed (${res.status}):`, text);
    process.exit(1);
  }

  const data = JSON.parse(text);
  if (!data.access_token) {
    console.error('No access_token in response:', data);
    process.exit(1);
  }

  console.log('✅ Got fresh tokens!');

  // Update ogre-server.json
  const serverJson = JSON.parse(fs.readFileSync(SERVER_JSON, 'utf8'));
  const anthropic = serverJson.providers.find(p => p.id === 'anthropic');
  if (anthropic) {
    anthropic.credentials.access_token = data.access_token;
    anthropic.credentials.refresh_token = data.refresh_token ?? anthropic.credentials.refresh_token;
    anthropic.credentials.token_type = data.token_type || 'Bearer';
    anthropic.credentials.expires_at = data.expires_in
      ? Date.now() + data.expires_in * 1000
      : null;
  }

  fs.writeFileSync(SERVER_JSON, JSON.stringify(serverJson, null, 2));
  console.log('✅ ogre-server.json updated with fresh token');
  console.log(`   Expires in: ${Math.round((data.expires_in || 0) / 60)} minutes`);

  // Clean up PKCE file
  fs.unlinkSync(PKCE_FILE);
  console.log('\nDone! You can now re-run the benchmark.\n');
}
