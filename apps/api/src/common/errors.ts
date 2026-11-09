/** An error that is safe to show to the caller. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  validation: (details: unknown) =>
    new AppError(400, "VALIDATION_FAILED", "The request is not valid", details),
  badRequest: (code: string, message: string) => new AppError(400, code, message),
  unauthorized: (message = "Authentication is required") =>
    new AppError(401, "UNAUTHORIZED", message),
  forbidden: (message = "You do not have permission to do this") =>
    new AppError(403, "FORBIDDEN", message),
  notFound: (what: string) => new AppError(404, "NOT_FOUND", `${what} was not found`),
  conflict: (code: string, message: string, details?: unknown) =>
    new AppError(409, code, message, details),
};

/** Fail loudly if a query that must return a row did not. */
export function first<T>(rows: readonly T[], what: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`Expected a row for ${what} but the database returned none`);
  }
  return row;
}
