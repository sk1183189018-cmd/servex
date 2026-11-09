import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Response } from "express";
import { AppError } from "./errors.js";
import type { AppRequest } from "./request.js";

const STATUS_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "METHOD_NOT_ALLOWED",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  422: "UNPROCESSABLE",
  429: "RATE_LIMITED",
};

function clientStatusOf(exception: unknown): number | undefined {
  if (exception !== null && typeof exception === "object") {
    const status = (exception as { status?: unknown; statusCode?: unknown }).status;
    const statusCode = (exception as { statusCode?: unknown }).statusCode;
    const value = typeof status === "number" ? status : statusCode;
    if (typeof value === "number" && value >= 400 && value < 500) return value;
  }
  return undefined;
}

/**
 * Every error leaves the API in one shape: { error: { code, message, details?, requestId } }.
 * Unknown errors are logged with their stack but only a generic message reaches the caller.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Http");

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<AppRequest>();

    let status = 500;
    let code = "INTERNAL_ERROR";
    let message = "Something went wrong on our side";
    let details: unknown;

    if (exception instanceof AppError) {
      status = exception.status;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_CODES[status] ?? "HTTP_ERROR";
      const body = exception.getResponse();
      message =
        typeof body === "string"
          ? body
          : typeof (body as { message?: unknown }).message === "string"
            ? (body as { message: string }).message
            : exception.message;
    } else if (clientStatusOf(exception) !== undefined) {
      // Errors from body parsing (bad JSON, payload too large) that are not Nest exceptions.
      status = clientStatusOf(exception) ?? 400;
      code = STATUS_CODES[status] ?? "BAD_REQUEST";
      message = status === 413 ? "The request body is too large" : "The request could not be read";
    } else {
      const error = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(
        `[${request.id ?? "-"}] ${request.method} ${request.url}: ${error.stack ?? error.message}`,
      );
    }

    response.status(status).json({
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
        requestId: request.id,
      },
    });
  }
}
