import { z } from "zod";
import { SUPPORTED_LOCALES } from "../auth/auth.schemas.js";

export const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    timezone: z.string().trim().min(1).max(64),
    locale: z.enum(SUPPORTED_LOCALES),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Send at least one field to change",
  });
export type UpdateOrganizationInput = z.output<typeof updateOrganizationSchema>;
