import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { configureApp } from "./app.js";
import { parseEnv } from "./config/env.js";

const env = parseEnv(process.env);
const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env));
configureApp(app, env);
await app.listen(env.PORT, "0.0.0.0");
new Logger("Bootstrap").log(`SERVEX API listening on port ${env.PORT}`);
