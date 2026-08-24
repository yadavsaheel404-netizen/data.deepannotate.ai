/**
 * Frontend-only helpers for compact name display.
 * Backend stores the full display_name unchanged.
 */

const capitalize = (s: string): string =>
  s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/**
 * Extract the first name from a display name and capitalize it.
 * - Trims whitespace
 * - Splits by space, takes first token
 * - Capitalizes first letter
 * - Falls back to "User" when empty/null
 */
export function getFirstName(displayName?: string | null): string {
  if (!displayName) return 'User';
  const trimmed = displayName.trim();
  if (!trimmed) return 'User';
  const first = trimmed.split(/\s+/)[0];
  return capitalize(first);
}
