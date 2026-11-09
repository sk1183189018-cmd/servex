import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/auth.decorators.js";
import { AppError } from "../common/errors.js";
import { DatabaseService } from "../db/database.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  /** Liveness: the process is up. */
  @Public()
  @Get()
  live() {
    return { status: "ok" };
  }

  /** Readiness: the process can reach its database. */
  @Public()
  @Get("ready")
  async ready() {
    try {
      await this.database.ping();
    } catch {
      throw new AppError(503, "NOT_READY", "The database is not reachable");
    }
    return { status: "ready" };
  }
}
