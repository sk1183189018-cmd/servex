import { z } from "zod";
import { PASSWORD_MAX_LENGTH } from "./password.service.js";

export const SUPPORTED_LOCALES = ["en", "hi", "gu"] as const;

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const registerSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  countryCode: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{2}$/, { message: "Use a 2-letter country code such as IN" })),
  currency: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/, { message: "Use a 3-letter currency code such as INR" }))
    .optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  locale: z.enum(SUPPORTED_LOCALES).default("en"),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(5).max(20).optional(),
  email,
  password: z.string().max(PASSWORD_MAX_LENGTH),
});
export type RegisterInput = z.output<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  organizationSlug: z.string().trim().toLowerCase().min(1).max(60).optional(),
});
export type LoginInput = z.output<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});
export type RefreshInput = z.output<typeof refreshSchema>;
