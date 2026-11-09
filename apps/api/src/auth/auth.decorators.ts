import { createParamDecorator, SetMetadata, type ExecutionContext } from "@nestjs/common";
import type { Permission } from "@servex/shared";
import { Errors } from "../common/errors.js";
import { clientMetaOf, type AppRequest, type ClientMeta } from "../common/request.js";
import type { AuthContext, TenantAuthContext } from "./auth-context.js";

export const IS_PUBLIC_KEY = "servex:public";
export const AUTHENTICATED_KEY = "servex:authenticated";
export const PERMISSIONS_KEY = "servex:permissions";

/** No login needed. Use sparingly: health checks and the auth endpoints themselves. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Any signed-in user may call this. Every route must use this, Public or RequirePermissions. */
export const Authenticated = () => SetMetadata(AUTHENTICATED_KEY, true);

/** The caller must hold every listed permission. Enforced on the server for every request. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** The signed-in caller. Fails with 401 if the route forgot to require login. */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const request = context.switchToHttp().getRequest<AppRequest>();
    if (request.auth === undefined) throw Errors.unauthorized();
    return request.auth;
  },
);

/** The signed-in caller, required to be acting inside a company. */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantAuthContext => {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const auth = request.auth;
    if (auth === undefined) throw Errors.unauthorized();
    if (auth.organizationId === null) {
      throw Errors.forbidden("This action needs a company session");
    }
    return { ...auth, organizationId: auth.organizationId };
  },
);

export const RequestMeta = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ClientMeta => {
    return clientMetaOf(context.switchToHttp().getRequest<AppRequest>());
  },
);
