import { z } from "zod";

// Email is the contact's identity (the DB keys uniqueness on lower(trim(email))).
// Validate non-empty first so a blank field reads "required", not "invalid", then
// check the address shape. z.email() is the zod v4 top-level form (matches the
// projects slice); the chained .email() is deprecated.
const isEmail = (v: string) => z.email().safeParse(v).success;

export const pmContactSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().min(1, "Email is required").refine(isEmail, "Enter a valid email"),
});

export type PmContactInput = z.infer<typeof pmContactSchema>;
