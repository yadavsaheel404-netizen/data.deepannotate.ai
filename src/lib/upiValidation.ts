export const UPI_REGEX = /^[a-zA-Z0-9._]{2,}@[a-zA-Z]{2,}$/;

export const isValidUpi = (value: string): boolean => UPI_REGEX.test(value.trim());

/**
 * Sanitize UPI input as the user types:
 * - trim spaces
 * - lowercase
 * - strip disallowed characters (only a-z, 0-9, dot, underscore, single @)
 * - collapse multiple '@' to the first one
 */
export const sanitizeUpiInput = (raw: string): string => {
  let v = raw.toLowerCase().replace(/\s+/g, '');
  // Remove any character that's not allowed
  v = v.replace(/[^a-z0-9._@]/g, '');
  // Allow only first '@'
  const firstAt = v.indexOf('@');
  if (firstAt !== -1) {
    const username = v.slice(0, firstAt).replace(/@/g, '');
    const bank = v.slice(firstAt + 1).replace(/@/g, '').replace(/[^a-z]/g, '');
    v = `${username}@${bank}`;
  }
  return v;
};
