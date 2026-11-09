import { z } from "zod";
import { MEMBERSHIP_ROLES } from "../db/schema.js";

export const changeRoleSchema = z.object({ role: z.enum(MEMBERSHIP_ROLES) });
export type ChangeRoleInput = z.output<typeof changeRoleSchema>;

export const changeStatusSchema = z.object({ status: z.enum(["active", "disabled"]) });
export type ChangeStatusInput = z.output<typeof changeStatusSchema>;
