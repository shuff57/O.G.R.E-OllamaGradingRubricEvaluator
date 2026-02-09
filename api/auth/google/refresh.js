// POST /api/auth/google/refresh — Exchange refresh token for new access token

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'chrome-extension://your-extension-id';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { refresh_token } = req.body || {};

  if (!refresh_token || typeof refresh_token !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing or invalid "refresh_token" parameter' });
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    const data = await response.json();

    if (data.access_token) {
      return res.status(200).json({
        success: true,
        access_token: data.access_token,
        expires_in: data.expires_in,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: data.error_description || data.error || 'Failed to refresh token',
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
}
