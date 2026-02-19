/**
 * site-profiles.js — Site profile storage, loading, and management
 *
 * A "site profile" is a set of CSS selectors + configuration that describes
 * how to extract students, scores, feedback, and rubric data from a specific
 * LMS grading page (MyOpenMath, Canvas, Blackboard, Moodle, etc.).
 *
 * The MyOpenMath profile is built-in as the default. Additional profiles are
 * discovered via AI (see discover.js) and stored in chrome.storage.local.
 */

// ============================================================================
// Built-in Default Profile: MyOpenMath
// ============================================================================

const DEFAULT_MYOPENMATH_PROFILE = {
  id: 'myopenmath',
  name: 'MyOpenMath',
  isBuiltIn: true,
  urlPatterns: ['gradeallq2.php', 'myopenmath.com', 'demo-grading-page.html', 'mock-myopenmath'],
  selectors: {
    studentSection: 'div[data-lastchange]',
    studentName: 'b',
    questionRegion: 'div[role="region"][aria-label^="Question"]',
    scoreInput: 'input[aria-label="Score"]',
    feedbackBox: 'div.fbbox[role="textbox"][aria-label="Feedback"][contenteditable]',
    feedbackHidden: 'input[type="hidden"][name^="fb-"]',
    fullCreditLink: 'a.fullcredlink',
  },
  extraction: {
    responseMethod: 'childIndex',
    responsePath: 'questionRegion.children[1].children[1]',
    maxScoreMethod: 'parentTextRegex',
    maxScoreRegex: '\\/(\\d+\\.?\\d*)',
    maxScoreDefault: '10',
  },
  navigation: {
    mode: 'batch',
  },
  feedback: {
    type: 'tinymce-inline',
    requiresHiddenSync: true,
    htmlWrap: true,
  },
  save: {
    buttonText: 'Quick Save',
    fallbackText: 'Save Changes',
  },
};

// ============================================================================
// Built-in Profile: Canvas SpeedGrader
// ============================================================================

const DEFAULT_CANVAS_SPEEDGRADER_PROFILE = {
  id: 'canvas-speedgrader',
  name: 'Canvas SpeedGrader',
  isBuiltIn: true,
  urlPatterns: ['speed_grader', 'speedgrader'],
  selectors: {
    studentSection: null, // not used — sequential mode shows one student at a time
    studentName: '[data-testid="student-select-trigger"]',
    questionRegion: '#submission-preview-iframe',
    scoreInput: '[data-testid="grade-input"]',
    feedbackBox: null, // uses TinyMCE iframe — handled by fillGradeSequential
    feedbackHidden: null,
    fullCreditLink: null,
  },
  extraction: {
    responseMethod: 'iframe',
    iframeSelector: '#submission-preview-iframe',
    maxScoreMethod: 'inputLabel',
    maxScorePattern: 'Grade out of (\\d+)',
    maxScoreDefault: '100',
  },
  navigation: {
    mode: 'sequential',
    nextButton: '[data-testid="next-student-button"]',
    prevButton: '[data-testid="previous-student-button"]',
    studentIndicator: '[data-testid="student-select-trigger"]',
    studentCountText: null, // detect total from dropdown item count
    waitAfterNavMs: 2000,
    waitForSelector: '[data-testid="grade-input"]',
    submitPerStudent: true,
    submitButton: '[data-testid="submit-comment-button"]',
  },
  feedback: {
    type: 'tinymce-iframe', // TinyMCE Rich Content Editor inside an iframe
    requiresHiddenSync: false,
    htmlWrap: true,
  },
  save: {
    buttonText: 'Submit',
    fallbackText: 'Save',
  },
};

const BUILT_IN_PROFILES = [DEFAULT_MYOPENMATH_PROFILE, DEFAULT_CANVAS_SPEEDGRADER_PROFILE];

// ============================================================================
// Storage Key
// ============================================================================

const STORAGE_KEY = 'siteProfiles';

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Load all saved (user-created) profiles from chrome.storage.local.
 * @returns {Promise<Object>} Map of profile id → profile object
 */
async function loadSavedProfiles() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || {};
  } catch (err) {
    console.error('[SiteProfiles] Failed to load saved profiles:', err);
    return {};
  }
}

/**
 * List all profiles (built-in + saved).
 * @returns {Promise<Array>} Array of profile objects
 */
async function listProfiles() {
  const saved = await loadSavedProfiles();
  const savedList = Object.values(saved);
  return [...BUILT_IN_PROFILES, ...savedList];
}

/**
 * Save a profile to chrome.storage.local.
 * @param {Object} profile - Profile object with at minimum: id, name, selectors
 * @returns {Promise<void>}
 */
async function saveProfile(profile) {
  if (!profile.id || !profile.name || !profile.selectors) {
    throw new Error('Profile must have id, name, and selectors');
  }

  const saved = await loadSavedProfiles();
  saved[profile.id] = {
    ...profile,
    isBuiltIn: false,
    updatedAt: new Date().toISOString(),
    createdAt: profile.createdAt || new Date().toISOString(),
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: saved });
  console.log(`[SiteProfiles] Saved profile: ${profile.name} (${profile.id})`);
}

/**
 * Delete a saved profile by id.
 * @param {string} profileId
 * @returns {Promise<void>}
 */
async function deleteProfile(profileId) {
  const saved = await loadSavedProfiles();
  delete saved[profileId];
  await chrome.storage.local.set({ [STORAGE_KEY]: saved });
  console.log(`[SiteProfiles] Deleted profile: ${profileId}`);
}

/**
 * Get a specific profile by id (checks both built-in and saved).
 * @param {string} profileId
 * @returns {Promise<Object|null>}
 */
async function getProfile(profileId) {
  // Check built-ins first
  const builtIn = BUILT_IN_PROFILES.find(p => p.id === profileId);
  if (builtIn) return builtIn;

  // Check saved
  const saved = await loadSavedProfiles();
  return saved[profileId] || null;
}

// ============================================================================
// URL Matching
// ============================================================================

/**
 * Find the best matching profile for a given URL.
 * Checks saved profiles first (user-created take priority), then built-ins.
 * @param {string} url - The page URL to match
 * @returns {Promise<Object|null>} Matching profile or null
 */
async function matchProfile(url) {
  if (!url) return null;

  // Check saved profiles first (user profiles override built-ins)
  const saved = await loadSavedProfiles();
  for (const profile of Object.values(saved)) {
    if (profile.urlPatterns && profile.urlPatterns.some(p => url.includes(p))) {
      return profile;
    }
  }

  // Check built-in profiles
  for (const profile of BUILT_IN_PROFILES) {
    if (profile.urlPatterns && profile.urlPatterns.some(p => url.includes(p))) {
      return profile;
    }
  }

  return null;
}

/**
 * Convenience: get the active profile for a URL, returning its selectors.
 * @param {string} url - The page URL
 * @returns {Promise<Object|null>} Full profile object or null
 */
async function getActiveProfile(url) {
  return matchProfile(url);
}

// ============================================================================
// Profile Creation Helpers
// ============================================================================

/**
 * Generate a URL-safe profile ID from a name.
 * @param {string} name - Human-readable name (e.g., "Canvas SpeedGrader")
 * @returns {string} Safe ID (e.g., "canvas-speedgrader")
 */
function generateProfileId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

/**
 * Create a new profile from discovered selectors.
 * @param {string} name - Profile name
 * @param {string} pageUrl - The URL where discovery happened
 * @param {Object} selectors - Discovered selectors
 * @param {Object} [feedbackConfig] - Feedback type configuration
 * @param {Object} [saveConfig] - Save button configuration
 * @param {Object} [navigationConfig] - Navigation mode configuration
 * @returns {Object} A complete profile object (not yet saved)
 */
function createProfile(name, pageUrl, selectors, feedbackConfig = null, saveConfig = null, navigationConfig = null) {
  // Extract URL patterns from the page URL
  const urlObj = new URL(pageUrl);
  const urlPatterns = [urlObj.hostname];

  // Add pathname pattern if it looks specific (not just "/")
  const path = urlObj.pathname;
  if (path && path !== '/' && path.length > 1) {
    // Use the last significant path segment
    const segments = path.split('/').filter(Boolean);
    if (segments.length > 0) {
      urlPatterns.push(segments[segments.length - 1]);
    }
  }

  return {
    id: generateProfileId(name),
    name,
    isBuiltIn: false,
    urlPatterns,
    selectors: {
      studentSection: selectors.studentSection || null,
      studentName: selectors.studentName || null,
      scoreInput: selectors.scoreInput || null,
      feedbackBox: selectors.feedbackBox || null,
      feedbackHidden: selectors.feedbackHidden || null,
      questionRegion: selectors.questionRegion || null,
      fullCreditLink: selectors.fullCreditLink || null,
      ...selectors,
    },
    feedback: feedbackConfig || {
      type: 'textarea',
      requiresHiddenSync: false,
      htmlWrap: false,
    },
    navigation: navigationConfig || {
      mode: 'batch',
    },
    save: saveConfig || {
      buttonText: 'Save',
      fallbackText: 'Submit',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Exports
// ============================================================================

const SiteProfiles = {
  DEFAULT_MYOPENMATH_PROFILE,
  DEFAULT_CANVAS_SPEEDGRADER_PROFILE,
  BUILT_IN_PROFILES,
  listProfiles,
  saveProfile,
  deleteProfile,
  getProfile,
  matchProfile,
  getActiveProfile,
  generateProfileId,
  createProfile,
  loadSavedProfiles,
};

// Attach to window for <script> usage
if (typeof window !== 'undefined') {
  window.SiteProfiles = SiteProfiles;
}

export {
  DEFAULT_MYOPENMATH_PROFILE,
  DEFAULT_CANVAS_SPEEDGRADER_PROFILE,
  BUILT_IN_PROFILES,
  listProfiles,
  saveProfile,
  deleteProfile,
  getProfile,
  matchProfile,
  getActiveProfile,
  generateProfileId,
  createProfile,
  loadSavedProfiles,
};

export default SiteProfiles;
