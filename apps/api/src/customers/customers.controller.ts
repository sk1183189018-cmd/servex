import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import type { TenantAuthContext } from "../auth/auth-context.js";
import { CurrentTenant, RequestMeta, RequirePermissions } from "../auth/auth.decorators.js";
import type { ClientMeta } from "../common/request.js";
import { uuidParam, ZodValidationPipe } from "../common/zod-pipe.js";
import {
  createCustomerSchema,
  listCustomersSchema,
  updateCustomerSchema,
  type CreateCustomerInput,
  type ListCustomersQuery,
  type UpdateCustomerInput,
} from "./customers.schemas.js";
import { CustomersService } from "./customers.service.js";

@Controller("customers")
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @RequirePermissions("customers:read")
  @Get()
  list(
    @CurrentTenant() auth: TenantAuthContext,
    @Query(new ZodValidationPipe(listCustomersSchema)) query: ListCustomersQuery,
  ) {
    return this.customers.list(auth, query);
  }

  @RequirePermissions("customers:read")
  @Get(":id")
  get(
    @CurrentTenant() auth: TenantAuthContext,
    @Param("id", new ZodValidationPipe(uuidParam)) id: string,
  ) {
    return this.customers.get(auth, id);
  }

  @RequirePermissions("customers:write")
  @Post()
  create(
    @CurrentTenant() auth: TenantAuthContext,
    @Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomerInput,
    @RequestMeta() meta: ClientMeta,
  ) {
    return this.customers.create(auth, body, meta);
  }

  @RequirePermissions("customers:write")
  @Patch(":id")
  update(
    @CurrentTenant() auth: TenantAuthContext,
    @Param("id", new ZodValidationPipe(uuidParam)) id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerInput,
    @RequestMeta() meta: ClientMeta,
  ) {
    return this.customers.update(auth, id, body, meta);
  }

  @RequirePermissions("customers:delete")
  @Delete(":id")
  @HttpCode(204)
  async remove(
    @CurrentTenant() auth: TenantAuthContext,
    @Param("id", new ZodValidationPipe(uuidParam)) id: string,
    @RequestMeta() meta: ClientMeta,
  ): Promise<void> {
    await this.customers.remove(auth, id, meta);
  }
}
