import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AllExceptionsFilter } from "./common/http-exception.filter.js";
import { requestIdMiddleware } from "./common/request-id.js";
import type { Env } from "./config/env.js";

/** Settings shared by the real server and the integration tests. */
export function configureApp(app: NestExpressApplication, env: Env): void {
  app.setGlobalPrefix("api/v1");
  app.set("trust proxy", env.TRUST_PROXY ? 1 : false);
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.useBodyParser("json", { limit: "256kb" });
  app.enableCors({
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"],
    maxAge: 600,
  });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}
