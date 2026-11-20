import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Work email is required").email("Enter a valid email address"),
  password: z.string().refine((value) => value.trim().length > 0, "Password is required"),
});

export type LoginValues = z.infer<typeof loginSchema>;
