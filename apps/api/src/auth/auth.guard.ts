import { Injectable, Logger, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Errors } from "../common/errors.js";
import type { AppRequest } from "../common/request.js";
import { AuthContextLoader } from "./auth-context.loader.js";
import { AUTHENTICATED_KEY, IS_PUBLIC_KEY, PERMISSIONS_KEY } from "./auth.decorators.js";
import { TokenService } from "./token.service.js";
import type { Permission } from "@servex/shared";

/** Step 1: work out who is calling. Public routes skip it. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly loader: AuthContextLoader,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<AppRequest>();
    const header = request.headers.authorization;
    const match = typeof header === "string" ? /^Bearer\s+(\S+)$/i.exec(header) : null;
    if (match?.[1] === undefined) throw Errors.unauthorized();

    const claims = await this.tokens.verifyAccess(match[1]);
    const auth = await this.loader.load(claims.userId, claims.organizationId);
    if (auth === null) throw Errors.unauthorized("Your session is no longer valid");

    request.auth = auth;
    return true;
  }
}

/**
 * Step 2: check the permission the route asks for. Deny by default: a route that declares no
 * access policy at all is refused, so a forgotten decorator can never expose an endpoint.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger("Permissions");

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets) === true) {
      return true;
    }
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      targets,
    );
    const authenticatedOnly =
      this.reflector.getAllAndOverride<boolean | undefined>(AUTHENTICATED_KEY, targets) === true;

    if (required === undefined && !authenticatedOnly) {
      this.logger.error(
        `Route ${context.getClass().name}.${context.getHandler().name} has no access policy; refusing`,
      );
      throw Errors.forbidden("This route has no access policy");
    }

    const auth = context.switchToHttp().getRequest<AppRequest>().auth;
    if (auth === undefined) throw Errors.unauthorized();
    if (
      required !== undefined &&
      !required.every((permission) => auth.permissions.has(permission))
    ) {
      throw Errors.forbidden();
    }
    return true;
  }
}
