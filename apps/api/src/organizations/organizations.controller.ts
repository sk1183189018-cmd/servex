import { Body, Controller, Get, Patch } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { AuditService } from "../audit/audit.service.js";
import type { TenantAuthContext } from "../auth/auth-context.js";
import {
  Authenticated,
  CurrentTenant,
  RequestMeta,
  RequirePermissions,
} from "../auth/auth.decorators.js";
import { Errors } from "../common/errors.js";
import type { ClientMeta } from "../common/request.js";
import { ZodValidationPipe } from "../common/zod-pipe.js";
import { DatabaseService } from "../db/database.service.js";
import { organizations } from "../db/schema.js";
import { updateOrganizationSchema, type UpdateOrganizationInput } from "./organizations.schemas.js";

const publicColumns = {
  id: organizations.id,
  name: organizations.name,
  slug: organizations.slug,
  countryCode: organizations.countryCode,
  defaultCurrency: organizations.defaultCurrency,
  timezone: organizations.timezone,
  locale: organizations.locale,
  status: organizations.status,
};

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

@Controller("organizations")
export class OrganizationsController {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  @Authenticated()
  @Get("current")
  async current(@CurrentTenant() auth: TenantAuthContext) {
    return this.database.tenant(auth.organizationId, async (tx) => {
      const [row] = await tx
        .select(publicColumns)
        .from(organizations)
        .where(eq(organizations.id, auth.organizationId))
        .limit(1);
      if (row === undefined) throw Errors.notFound("Organization");
      return row;
    });
  }

  @RequirePermissions("settings:manage")
  @Patch("current")
  async update(
    @CurrentTenant() auth: TenantAuthContext,
    @Body(new ZodValidationPipe(updateOrganizationSchema)) body: UpdateOrganizationInput,
    @RequestMeta() meta: ClientMeta,
  ) {
    if (body.timezone !== undefined && !isValidTimezone(body.timezone)) {
      throw Errors.validation([{ path: "timezone", message: "Unknown timezone" }]);
    }
    return this.database.tenant(auth.organizationId, async (tx) => {
      const [row] = await tx
        .update(organizations)
        .set(body)
        .where(eq(organizations.id, auth.organizationId))
        .returning(publicColumns);
      if (row === undefined) throw Errors.notFound("Organization");
      await this.audit.record(tx, {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: "organization.updated",
        entityType: "organization",
        entityId: auth.organizationId,
        metadata: { fields: Object.keys(body) },
        meta,
      });
      return row;
    });
  }
}
