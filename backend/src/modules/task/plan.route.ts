import { Elysia, t } from "elysia"
import { createAuthentication } from "@/plugins/auth"
import { identityService, type IdentityService } from "@/modules/identity/identity.service"
import { projectRepository, type ProjectRepository } from "@/modules/project/project.repository"
import { idParam, versionBody, shortText } from "@/modules/project/project.validation"
import { ok } from "@/utils/response"
import { PlanService } from "./plan.service"
import { planBody } from "./plan.validation"
import { taskQuery } from "./task.validation"
export function createPlanRoutes(
  repository: ProjectRepository = projectRepository,
  identities: IdentityService = identityService,
) {
  const service = new PlanService(repository)
  return new Elysia({ prefix: "/service/plans", tags: ["阶段计划"] })
    .use(createAuthentication(identities))
    .get(
      "",
      async ({ authenticate, query }) => ok(await service.list(await authenticate(), query)),
      { query: taskQuery },
    )
    .post(
      "",
      async ({ authenticate, body }) => ok(await service.save(await authenticate(), body)),
      { body: planBody },
    )
    .get(
      "/:id",
      async ({ authenticate, params }) => ok(await service.detail(await authenticate(), params.id)),
      { params: idParam },
    )
    .put(
      "/:id",
      async ({ authenticate, params, body }) => {
        const { version, ...input } = body
        return ok(await service.save(await authenticate(), input, params.id, version))
      },
      { params: idParam, body: t.Object({ ...planBody.properties, ...versionBody.properties }) },
    )
    .post(
      "/:id/publish",
      async ({ authenticate, params, body }) =>
        ok(await service.publish(await authenticate(), params.id, body.version)),
      { params: idParam, body: versionBody },
    )
    .post(
      "/:id/copy",
      async ({ authenticate, params, body }) =>
        ok(await service.copy(await authenticate(), params.id, body.effectiveDate, body.reason)),
      {
        params: idParam,
        body: t.Object({
          effectiveDate: t.String({ maxLength: 10 }),
          reason: shortText(1000, "调整原因"),
        }),
      },
    )
}
