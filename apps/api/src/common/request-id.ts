import { randomUUID } from "node:crypto";
import type { NextFunction, Response } from "express";
import type { AppRequest } from "./request.js";

/** Attach a request id (accepting a sane incoming one) and echo it back in a header. */
export function requestIdMiddleware(req: AppRequest, res: Response, next: NextFunction): void {
  const incoming = req.header("x-request-id");
  const id =
    incoming !== undefined && /^[A-Za-z0-9._-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  req.id = id;
  res.setHeader("x-request-id", id);
  next();
}
