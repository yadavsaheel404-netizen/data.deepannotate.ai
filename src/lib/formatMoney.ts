/**
 * Format a monetary amount for display.
 * - Rounds to 2 decimal places to avoid floating-point artifacts
 * - Whole numbers display without decimals (₹10, not ₹10.00)
 * - Fractional amounts use 2 decimals (₹9.50)
 */
export function formatMoney(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(2);
}
