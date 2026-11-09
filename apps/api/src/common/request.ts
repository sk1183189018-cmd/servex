import type { Request } from "express";
import type { AuthContext } from "../auth/auth-context.js";

/** Express request with the fields SERVEX adds. */
export type AppRequest = Request & { id?: string; auth?: AuthContext };

export interface ClientMeta {
  ip: string | null;
  userAgent: string | null;
}

export function clientMetaOf(request: Request): ClientMeta {
  const agent = request.headers["user-agent"];
  return {
    ip: request.ip ?? null,
    userAgent: typeof agent === "string" ? agent.slice(0, 300) : null,
  };
}
