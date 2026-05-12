import { z } from "zod";

export const addShoppingItemSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  quantity: z
    .string()
    .trim()
    .max(50)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export const toggleShoppingItemSchema = z.object({
  id: z.string().min(1),
});

export const deleteShoppingItemSchema = z.object({
  id: z.string().min(1),
});
