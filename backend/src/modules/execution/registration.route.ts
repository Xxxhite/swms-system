import { Elysia, t } from "elysia"
import { projectRepository, type ProjectRepository } from "@/modules/project/project.repository"
import { identityService, type IdentityService } from "@/modules/identity/identity.service"
import { createAuthentication } from "@/plugins/auth"
import { idParam } from "@/modules/project/project.validation"
import { ok } from "@/utils/response"
import { RegistrationService } from "./registration.service"
import { registrationBody } from "./registration.validation"
export function createRegistrationRoutes(
  repository: ProjectRepository = projectRepository,
  identities: IdentityService = identityService,
  now: () => Date = () => new Date(),
) {
  const service = new RegistrationService(repository, now)
  return new Elysia({ prefix: "/service/tasks/:id/registration", tags: ["执行登记"] })
    .use(createAuthentication(identities))
    .get(
      "",
      async ({ authenticate, params, query }) =>
        ok(await service.detail(await authenticate(), params.id, query.startAt)),
      { params: idParam, query: t.Object({ startAt: t.Optional(t.String({ maxLength: 40 })) }) },
    )
    .put(
      "",
      async ({ authenticate, params, body }) =>
        ok(await service.save(await authenticate(), params.id, body)),
      { params: idParam, body: registrationBody },
    )
}
