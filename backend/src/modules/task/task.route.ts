import { Elysia, t } from "elysia"
import { createAuthentication } from "@/plugins/auth"
import { identityService, type IdentityService } from "@/modules/identity/identity.service"
import { projectRepository, type ProjectRepository } from "@/modules/project/project.repository"
import { idParam, versionBody, shortText } from "@/modules/project/project.validation"
import { ok } from "@/utils/response"
import { TaskService } from "./task.service"
import { taskBody, taskQuery, batchBody, previewBody, confirmation } from "./task.validation"
export function createTaskRoutes(
  repository: ProjectRepository = projectRepository,
  identities: IdentityService = identityService,
) {
  const service = new TaskService(repository)
  return new Elysia({ prefix: "/service/tasks", tags: ["服务任务"] })
    .use(createAuthentication(identities))
    .get(
      "",
      async ({ authenticate, query }) => ok(await service.list(await authenticate(), query)),
      { query: taskQuery },
    )
    .get(
      "/calendar",
      async ({ authenticate, query }) => ok(await service.list(await authenticate(), query, true)),
      { query: taskQuery },
    )
    .get(
      "/candidates",
      async ({ authenticate, query }) => ok(await service.candidates(await authenticate(), query)),
      {
        query: t.Object({
          projectId: t.Optional(t.Numeric({ minimum: 1 })),
          teamId: t.Optional(t.Numeric({ minimum: 1 })),
          startAt: t.Optional(t.String({ maxLength: 40 })),
          endAt: t.Optional(t.String({ maxLength: 40 })),
        }),
      },
    )
    .post(
      "/preview",
      async ({ authenticate, body }) => ok(await service.preview(await authenticate(), body)),
      { body: previewBody },
    )
    .post(
      "/batch",
      async ({ authenticate, body }) => ok(await service.create(await authenticate(), body)),
      { body: batchBody },
    )
    .post(
      "",
      async ({ authenticate, body }) => ok(await service.create(await authenticate(), body)),
      {
        body: t.Object({
          ...taskBody.properties,
          requestKey: shortText(64, "请求标识"),
          ...confirmation,
        }),
      },
    )
    .get(
      "/:id",
      async ({ authenticate, params }) => ok(await service.detail(await authenticate(), params.id)),
      { params: idParam },
    )
    .put(
      "/:id",
      async ({ authenticate, params, body }) =>
        ok(await service.update(await authenticate(), params.id, body)),
      {
        params: idParam,
        body: t.Object({
          ...taskBody.properties,
          ...versionBody.properties,
          reason: shortText(1000, "变更原因"),
          ...confirmation,
        }),
      },
    )
    .post(
      "/:id/copy",
      async ({ authenticate, params, body }) =>
        ok(await service.create(await authenticate(), body, params.id)),
      { params: idParam, body: batchBody },
    )
    .post(
      "/:id/cancel",
      async ({ authenticate, params, body }) =>
        ok(await service.cancel(await authenticate(), params.id, body.version, body.reason)),
      {
        params: idParam,
        body: t.Object({ ...versionBody.properties, reason: shortText(1000, "取消原因") }),
      },
    )
}
