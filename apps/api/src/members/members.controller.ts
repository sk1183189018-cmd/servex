import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import type { TenantAuthContext } from "../auth/auth-context.js";
import { CurrentTenant, RequestMeta, RequirePermissions } from "../auth/auth.decorators.js";
import type { ClientMeta } from "../common/request.js";
import { uuidParam, ZodValidationPipe } from "../common/zod-pipe.js";
import {
  changeRoleSchema,
  changeStatusSchema,
  type ChangeRoleInput,
  type ChangeStatusInput,
} from "./members.schemas.js";
import { MembersService } from "./members.service.js";

@Controller("members")
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @RequirePermissions("users:read")
  @Get()
  list(@CurrentTenant() auth: TenantAuthContext) {
    return this.members.list(auth);
  }

  @RequirePermissions("users:manage", "roles:manage")
  @Patch(":id/role")
  changeRole(
    @CurrentTenant() auth: TenantAuthContext,
    @Param("id", new ZodValidationPipe(uuidParam)) id: string,
    @Body(new ZodValidationPipe(changeRoleSchema)) body: ChangeRoleInput,
    @RequestMeta() meta: ClientMeta,
  ) {
    return this.members.changeRole(auth, id, body.role, meta);
  }

  @RequirePermissions("users:manage")
  @Patch(":id/status")
  changeStatus(
    @CurrentTenant() auth: TenantAuthContext,
    @Param("id", new ZodValidationPipe(uuidParam)) id: string,
    @Body(new ZodValidationPipe(changeStatusSchema)) body: ChangeStatusInput,
    @RequestMeta() meta: ClientMeta,
  ) {
    return this.members.changeStatus(auth, id, body.status, meta);
  }
}
