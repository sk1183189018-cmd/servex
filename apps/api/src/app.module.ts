import { Module, type DynamicModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuditModule } from "./audit/audit.module.js";
import { AuthGuard, PermissionsGuard } from "./auth/auth.guard.js";
import { AuthModule } from "./auth/auth.module.js";
import { ConfigModule } from "./config/config.module.js";
import { ENV, type Env } from "./config/env.js";
import { CustomersModule } from "./customers/customers.module.js";
import { DatabaseModule } from "./db/database.module.js";
import { HealthController } from "./health/health.controller.js";
import { MembersModule } from "./members/members.module.js";
import { OrganizationsModule } from "./organizations/organizations.module.js";

const AUTH_PATH = "/api/v1/auth/";

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        ThrottlerModule.forRootAsync({
          inject: [ENV],
          useFactory: (config: Env) => [
            { name: "default", ttl: 60_000, limit: config.RATE_LIMIT_PER_MINUTE },
            {
              // Stricter limit for sign-up, login and token endpoints.
              name: "auth",
              ttl: 60_000,
              limit: config.AUTH_RATE_LIMIT_PER_MINUTE,
              skipIf: (context) =>
                !String(
                  context.switchToHttp().getRequest<{ path?: string }>().path ?? "",
                ).startsWith(AUTH_PATH),
            },
          ],
        }),
        DatabaseModule,
        AuditModule,
        AuthModule,
        OrganizationsModule,
        MembersModule,
        CustomersModule,
      ],
      controllers: [HealthController],
      providers: [
        // Order matters: rate limit, then identify the caller, then check permissions.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
    };
  }
}
