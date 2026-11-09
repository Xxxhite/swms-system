import { Elysia } from "elysia"
import { createAuthentication } from "@/plugins/auth"
import { identityService, type IdentityService } from "@/modules/identity/identity.service"
import { ok } from "@/utils/response"
import { RegionRepository } from "./region.repository"
import { RegionService } from "./region.service"
import { regionCodeParams } from "./region.validation"
export function createRegionRoutes(
  repository = new RegionRepository(),
  identities: IdentityService = identityService,
) {
  const service = new RegionService(repository)
  return new Elysia({ prefix: "/regions", tags: ["服务管理"] })
    .use(createAuthentication(identities))
    .guard({ auth: "active" })
    .get("/tree", async () => ok(await service.tree()))
    .get("/:code", async ({ params }) => ok(await service.path(params.code)), {
      params: regionCodeParams,
    })
}
