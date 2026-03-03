/**
 * Privacy utilities for FERPA compliance.
 * Strips student names and hashes student IDs before embedding storage.
 */

/**
 * Escape special regex metacharacters in a string.
 * @param str - Raw string to escape
 * @returns Regex-safe string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Remove occurrences of a student's name from response text.
 * Replaces all matches with [STUDENT]. Case-insensitive.
 * Also strips first-name-only mentions when full name has multiple parts.
 * @param response - Student response text
 * @param name - Student full name (or null to skip stripping)
 * @returns Sanitized response text
 */
export function stripStudentName(response: string, name: string | null): string {
  if (!name) return response;

  let result = response;

  // Replace full name (case-insensitive)
  const fullNameRegex = new RegExp(escapeRegex(name), 'gi');
  result = result.replace(fullNameRegex, '[STUDENT]');

  // Also replace first name alone if the name has multiple parts
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) {
    const firstNameRegex = new RegExp(`\\b${escapeRegex(parts[0])}\\b`, 'gi');
    result = result.replace(firstNameRegex, '[STUDENT]');
  }

  return result;
}

/**
 * Hash a student name/ID using SHA-256, truncated to 16 hex chars.
 * Uses Web Crypto API — available in Node 15+ and all modern browsers.
 * Non-reversible: cannot recover original name from hash.
 * @param name - Student identifier to hash
 * @returns 16-character lowercase hex string
 */
export async function hashStudentId(name: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(name);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 16);
}

/**
 * Sanitize a student response for storage: strip name + hash identity.
 * @param response - Raw student response text
 * @param studentName - Student's full name (null if unknown)
 * @returns Sanitized response and opaque student hash (null if no name)
 */
export async function sanitizeForStorage(
  response: string,
  studentName: string | null
): Promise<{ sanitizedResponse: string; studentHash: string | null }> {
  const sanitizedResponse = stripStudentName(response, studentName);
  const studentHash = studentName ? await hashStudentId(studentName) : null;
  return { sanitizedResponse, studentHash };
}
