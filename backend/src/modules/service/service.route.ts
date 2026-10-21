import { Elysia, t } from "elysia"
import { createAuthentication } from "@/plugins/auth"
import { identityService, type IdentityService } from "@/modules/identity/identity.service"
import { ok } from "@/utils/response"
import { projectRepository, type ProjectRepository } from "@/modules/project/project.repository"
import { idParam, listQuery, versionBody, pageResult } from "@/modules/project/project.validation"
import { ServiceService } from "./service.service"
import { MonthlyChangeService } from "./monthly-change.service"
import { monthlyBody, monthlyChangeBody } from "./service.validation"
/** 指标、月报及变更路由，所有正式数量变更由业务状态转换处理。 */
export function createServiceRoutes(
  repository: ProjectRepository = projectRepository,
  identities: IdentityService = identityService,
) {
  const service = new ServiceService(repository),
    changes = new MonthlyChangeService(repository)
  return new Elysia({ prefix: "/service", tags: ["服务管理"] })
    .use(createAuthentication(identities))
    .get(
      "/indicator-progress",
      async ({ authenticate, query }) =>
        ok(pageResult(await service.progress(await authenticate(), query), query)),
      { query: listQuery },
    )
    .get(
      "/indicator-warnings",
      async ({ authenticate, query }) =>
        ok(pageResult(await service.progress(await authenticate(), query), query)),
      { query: listQuery },
    )
    .get(
      "/monthly-reports",
      async ({ authenticate, query }) => ok(await service.list(await authenticate(), query)),
      { query: listQuery },
    )
    .get(
      "/monthly-reports/:id",
      async ({ authenticate, params }) => ok(await service.detail(await authenticate(), params.id)),
      { params: idParam },
    )
    .post(
      "/monthly-reports",
      async ({ authenticate, body }) => ok(await service.save(await authenticate(), body)),
      { body: monthlyBody },
    )
    .put(
      "/monthly-reports/:id",
      async ({ authenticate, params, body }) => {
        const { version, ...input } = body
        return ok(await service.save(await authenticate(), input, params.id, version))
      },
      { params: idParam, body: t.Object({ ...monthlyBody.properties, ...versionBody.properties }) },
    )
    .delete(
      "/monthly-reports/:id",
      async ({ authenticate, params, query }) =>
        ok(await service.state(await authenticate(), params.id, query.version, "delete")),
      { params: idParam, query: t.Object({ version: t.Numeric({ minimum: 1, multipleOf: 1 }) }) },
    )
    .post(
      "/monthly-reports/:id/submit",
      async ({ authenticate, params, body }) =>
        ok(await service.state(await authenticate(), params.id, body.version, "submit")),
      { params: idParam, body: versionBody },
    )
    .post(
      "/monthly-reports/:id/change-requests",
      async ({ authenticate, params, body }) =>
        ok(await changes.create(await authenticate(), params.id, body)),
      { params: idParam, body: monthlyChangeBody },
    )
    .post(
      "/monthly-change-requests/:id/withdraw",
      async ({ authenticate, params }) =>
        ok(await changes.withdraw(await authenticate(), params.id)),
      { params: idParam },
    )
}
