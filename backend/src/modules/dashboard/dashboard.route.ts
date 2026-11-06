import { Elysia } from "elysia"
import { createAuthentication } from "@/plugins/auth"
import { identityService, type IdentityService } from "@/modules/identity/identity.service"
import {
  ManagementRepository,
  managementRepository,
} from "@/modules/management/management.repository"
import { DashboardService } from "./dashboard.service"
import { ok } from "@/utils/response"
export function createDashboardRoutes(
  repository: ManagementRepository = managementRepository,
  identities: IdentityService = identityService,
) {
  const service = new DashboardService(repository)
  return new Elysia({ prefix: "/dashboard", tags: ["工作台"] })
    .use(createAuthentication(identities))
    .get("/overview", async ({ authenticate }) => ok(await service.overview(await authenticate())))
}
