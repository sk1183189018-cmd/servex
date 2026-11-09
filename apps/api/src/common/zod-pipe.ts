import { Injectable, type PipeTransform } from "@nestjs/common";
import { z } from "zod";
import { Errors } from "./errors.js";

/** Validates and transforms a body, query or param with a zod schema. */
@Injectable()
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw Errors.validation(
        result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}

export const uuidParam = z.uuid();

/** Standard page query used by list endpoints. */
export const pageQuery = {
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
