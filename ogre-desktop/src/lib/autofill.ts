import type { SiteCredential } from './db';

// ── LMS Login Form Selectors ────────────────────────────────────────────

/**
 * Selector configuration for a single LMS login form.
 */
interface LmsLoginSelectors {
  /** Human-readable LMS name */
  name: string;
  /** URL substring used to identify the LMS */
  urlPattern: string;
  /** CSS selector for the username/email input */
  usernameSelector: string;
  /** CSS selector for the password input */
  passwordSelector: string;
}

/**
 * Login form selector map for supported LMS platforms.
 * Each entry maps a site name to its login form CSS selectors.
 */
export const LMS_LOGIN_SELECTORS: LmsLoginSelectors[] = [
  {
    name: 'MyOpenMath',
    urlPattern: 'myopenmath.com',
    usernameSelector: 'input[name="username"]',
    passwordSelector: 'input[name="password"]',
  },
  {
    name: 'Canvas',
    urlPattern: 'instructure.com',
    usernameSelector: 'input#pseudonym_session_unique_id',
    passwordSelector: 'input#pseudonym_session_password',
  },
  {
    name: 'Blackboard',
    urlPattern: 'blackboard.com',
    usernameSelector: 'input#user_id',
    passwordSelector: 'input#password',
  },
  {
    name: 'Moodle',
    urlPattern: 'moodle.org',
    usernameSelector: 'input#username',
    passwordSelector: 'input#password',
  },
];

// ── Auto-Fill Script Generator ──────────────────────────────────────────

/**
 * Generate a JavaScript string that, when injected into a webview page,
 * will attempt to fill username and password fields for known LMS login forms.
 *
 * The generated script:
 * - Checks the current page URL against known LMS patterns
 * - Finds login fields using the corresponding CSS selectors
 * - Sets values and dispatches 'input' events (for React/Angular compatibility)
 * - Retries up to 3 times with exponential backoff (1s, 2s, 4s)
 * - Does NOT auto-submit the form
 *
 * @param username - The username to fill
 * @param password - The password to fill
 * @returns JavaScript code string ready for webview injection
 */
export function generateAutoFillScript(username: string, password: string): string {
  // Escape special characters for safe embedding in JS string literals
  const safeUsername = escapeJsString(username);
  const safePassword = escapeJsString(password);

  // Serialize the selector map into the injected script
  const selectorsJson = JSON.stringify(LMS_LOGIN_SELECTORS);

  return `
(function() {
  'use strict';

  var SELECTORS = ${selectorsJson};
  var MAX_RETRIES = 3;
  var RETRY_DELAYS = [1000, 2000, 4000];

  /**
   * Find the matching LMS config for the current page URL.
   */
  function findMatchingLms() {
    var url = window.location.href.toLowerCase();
    for (var i = 0; i < SELECTORS.length; i++) {
      if (url.indexOf(SELECTORS[i].urlPattern) !== -1) {
        return SELECTORS[i];
      }
    }
    return null;
  }

  /**
   * Set a value on an input element and dispatch events for framework compatibility.
   */
  function setInputValue(el, value) {
    // Use native setter to bypass React/Angular controlled input wrappers
    var nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    );
    if (nativeSetter && nativeSetter.set) {
      nativeSetter.set.call(el, value);
    } else {
      el.value = value;
    }

    // Dispatch events that frameworks listen for
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Attempt to fill the login form fields.
   * Returns true if both fields were found and filled.
   */
  function tryFill(lms) {
    var userEl = document.querySelector(lms.usernameSelector);
    var passEl = document.querySelector(lms.passwordSelector);

    if (!userEl || !passEl) {
      return false;
    }

    setInputValue(userEl, '${safeUsername}');
    setInputValue(passEl, '${safePassword}');
    return true;
  }

  /**
   * Main entry: match LMS, then try fill with retries.
   */
  function main() {
    var lms = findMatchingLms();
    if (!lms) {
      console.log('[OGRE Autofill] No matching LMS detected for', window.location.href);
      return;
    }

    console.log('[OGRE Autofill] Detected LMS:', lms.name);

    var attempt = 0;

    function attemptFill() {
      if (tryFill(lms)) {
        console.log('[OGRE Autofill] Successfully filled login form for', lms.name);
        return;
      }

      attempt++;
      if (attempt < MAX_RETRIES) {
        console.log('[OGRE Autofill] Fields not found, retry', attempt, 'in', RETRY_DELAYS[attempt - 1], 'ms');
        setTimeout(attemptFill, RETRY_DELAYS[attempt - 1]);
      } else {
        console.warn('[OGRE Autofill] Could not find login fields after', MAX_RETRIES, 'retries');
      }
    }

    attemptFill();
  }

  // Run after DOM is ready (or immediately if already loaded)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
`;
}

// ── Credential-URL Matching ─────────────────────────────────────────────

/**
 * Find the best matching credential for a given URL.
 *
 * Checks each credential's `url_pattern` against the URL.
 * Returns the first credential whose url_pattern is contained in the URL,
 * or null if no match is found.
 *
 * @param url - The page URL to match against
 * @param credentials - Array of stored site credentials
 * @returns The best matching SiteCredential, or null
 */
export function matchCredentialsToUrl(
  url: string,
  credentials: SiteCredential[],
): SiteCredential | null {
  if (!url || !credentials || credentials.length === 0) {
    return null;
  }

  const normalizedUrl = url.toLowerCase();

  for (const cred of credentials) {
    if (normalizedUrl.includes(cred.url_pattern.toLowerCase())) {
      return cred;
    }
  }

  return null;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Escape a string for safe embedding inside a JavaScript single-quoted string literal.
 * Handles backslashes, single quotes, newlines, and carriage returns.
 */
function escapeJsString(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}
