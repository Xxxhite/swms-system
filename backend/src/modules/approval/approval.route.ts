import { Elysia, t } from "elysia"
import { createAuthentication } from "@/plugins/auth"
import { identityService, type IdentityService } from "@/modules/identity/identity.service"
import { ok } from "@/utils/response"
import { projectRepository, type ProjectRepository } from "@/modules/project/project.repository"
import { idParam, listQuery } from "@/modules/project/project.validation"
import { ApprovalService } from "./approval.service"
/** 审批任务路由：只接受决策版本和意见，不允许客户端更换实际审批人。 */
export function createApprovalRoutes(
  repository: ProjectRepository = projectRepository,
  identities: IdentityService = identityService,
) {
  const service = new ApprovalService(repository),
    body = t.Object({
      version: t.Integer({ minimum: 1 }),
      comment: t.Optional(t.String({ maxLength: 1000 })),
    })
  return new Elysia({ prefix: "/approvals", tags: ["审批"] })
    .use(createAuthentication(identities))
    .get(
      "/tasks",
      async ({ authenticate, query }) => ok(await service.tasks(await authenticate(), query)),
      { query: listQuery },
    )
    .get(
      "/instances/:id",
      async ({ authenticate, params }) => ok(await service.detail(await authenticate(), params.id)),
      { params: idParam },
    )
    .post(
      "/tasks/:id/approve",
      async ({ authenticate, params, body }) =>
        ok(await service.decide(await authenticate(), params.id, body.version, true, body.comment)),
      { params: idParam, body },
    )
    .post(
      "/tasks/:id/reject",
      async ({ authenticate, params, body }) =>
        ok(
          await service.decide(await authenticate(), params.id, body.version, false, body.comment),
        ),
      { params: idParam, body },
    )
}
