import { Elysia } from "elysia"
import { createAuthentication } from "@/plugins/auth"
import { identityService, type IdentityService } from "@/modules/identity/identity.service"
import { ok } from "@/utils/response"
import { ManagementRepository, managementRepository } from "./management.repository"
import { ManagementService } from "./management.service"
import {
  managementQuery,
  idParam,
  createBody,
  updateBody,
  transitionBody,
} from "./management.validation"
export function createManagementRoutes(
  repository: ManagementRepository = managementRepository,
  identities: IdentityService = identityService,
) {
  const service = new ManagementService(repository)
  return new Elysia({ prefix: "/management-followups", tags: ["管理跟进"] })
    .use(createAuthentication(identities))
    .get(
      "",
      async ({ authenticate, query }) => ok(await service.list(await authenticate(), query)),
      { query: managementQuery },
    )
    .get(
      "/candidates",
      async ({ authenticate, query }) =>
        ok(await service.candidates(await authenticate(), query.projectId, query.teamId)),
      { query: managementQuery },
    )
    .get(
      "/:id",
      async ({ authenticate, params }) => ok(await service.detail(await authenticate(), params.id)),
      { params: idParam },
    )
    .post(
      "",
      async ({ authenticate, body }) => ok(await service.create(await authenticate(), body)),
      { body: createBody },
    )
    .put(
      "/:id",
      async ({ authenticate, params, body }) =>
        ok(await service.mutate(await authenticate(), params.id, body)),
      { params: idParam, body: updateBody },
    )
    .post(
      "/:id/transition",
      async ({ authenticate, params, body }) =>
        ok(await service.mutate(await authenticate(), params.id, body)),
      { params: idParam, body: transitionBody },
    )
}
