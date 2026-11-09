import { z } from "zod";
import { pageQuery } from "../common/zod-pipe.js";

/** Trim, and treat an empty string as "no value". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullish();

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .transform((value) => (value === "" ? null : value))
  .pipe(z.email().nullable())
  .nullish();

const optionalPhone = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .pipe(
    z
      .string()
      .regex(/^[0-9+()\-.\s]{5,20}$/, { message: "Phone may contain digits, spaces and + ( ) - ." })
      .nullable(),
  )
  .nullish();

const customerFields = {
  name: z.string().trim().min(1).max(200),
  email: optionalEmail,
  phone: optionalPhone,
  category: optionalText(60),
  notes: optionalText(5000),
};

export const createCustomerSchema = z.object(customerFields);
export type CreateCustomerInput = z.output<typeof createCustomerSchema>;

/** Omitted field = leave unchanged. null = clear the value. */
export const updateCustomerSchema = z
  .object(customerFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Send at least one field to change",
  });
export type UpdateCustomerInput = z.output<typeof updateCustomerSchema>;

export const listCustomersSchema = z.object({
  ...pageQuery,
  q: z.string().trim().max(100).optional(),
  sort: z.enum(["name", "createdAt"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
});
export type ListCustomersQuery = z.output<typeof listCustomersSchema>;
