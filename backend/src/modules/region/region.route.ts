import { Elysia, t } from "elysia"
import { createAuthentication } from "@/plugins/auth"
import { identityService, type IdentityService } from "@/modules/identity/identity.service"
import { ok } from "@/utils/response"
import { RegionRepository } from "./region.repository"
import { RegionService } from "./region.service"
export function createRegionRoutes(
  repository = new RegionRepository(),
  identities: IdentityService = identityService,
) {
  const service = new RegionService(repository)
  return new Elysia({ prefix: "/regions", tags: ["服务管理"] })
    .use(createAuthentication(identities))
    .get("/tree", async ({ authenticate }) => {
      await authenticate()
      return ok(await service.tree())
    })
    .get(
      "/:code",
      async ({ authenticate, params }) => {
        await authenticate()
        return ok(await service.path(params.code))
      },
      { params: t.Object({ code: t.String({ maxLength: 24 }) }) },
    )
}
