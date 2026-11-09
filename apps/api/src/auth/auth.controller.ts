import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod-pipe.js";
import type { ClientMeta } from "../common/request.js";
import type { AuthContext } from "./auth-context.js";
import { Authenticated, CurrentAuth, Public, RequestMeta } from "./auth.decorators.js";
import {
  loginSchema,
  refreshSchema,
  registerSchema,
  type LoginInput,
  type RefreshInput,
  type RegisterInput,
} from "./auth.schemas.js";
import { AuthService } from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Create a company and its first owner account. */
  @Public()
  @Post("register")
  register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @RequestMeta() meta: ClientMeta,
  ) {
    return this.auth.register(body, meta);
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @RequestMeta() meta: ClientMeta,
  ) {
    return this.auth.login(body, meta);
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput,
    @RequestMeta() meta: ClientMeta,
  ) {
    return this.auth.refresh(body.refreshToken, meta);
  }

  @Public()
  @Post("logout")
  @HttpCode(204)
  async logout(
    @Body(new ZodValidationPipe(refreshSchema)) body: RefreshInput,
    @RequestMeta() meta: ClientMeta,
  ): Promise<void> {
    await this.auth.logout(body.refreshToken, meta);
  }

  @Authenticated()
  @Get("me")
  me(@CurrentAuth() auth: AuthContext) {
    return this.auth.profile(auth);
  }
}
