import { z } from "zod";

// Dollars-as-string from a form input. Accepts "2.50", "-10", "0.99",
// "5". Converted to integer cents in the action.
export const addAllowanceSchema = z.object({
  userId: z.string().min(1),
  amountDollars: z
    .string()
    .trim()
    .regex(
      /^-?\d+(\.\d{1,2})?$/,
      "Enter an amount like 2.50, 10, or -15",
    ),
  reason: z.string().trim().min(1, "Add a reason").max(200),
});

export const deleteAllowanceSchema = z.object({
  id: z.string().min(1),
});

// "2.50" → 250, "-10" → -1000, "0.99" → 99.
export function dollarsToCents(s: string): number {
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function centsToDollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}
