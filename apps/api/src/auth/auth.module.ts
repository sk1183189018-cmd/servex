import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthContextLoader } from "./auth-context.loader.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { PasswordService } from "./password.service.js";
import { TokenService } from "./token.service.js";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, AuthContextLoader],
  exports: [TokenService, AuthContextLoader, PasswordService],
})
export class AuthModule {}
