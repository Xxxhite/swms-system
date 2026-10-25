import { Elysia, t } from "elysia"
import { createAuthentication } from "@/plugins/auth"
import { identityService, type IdentityService } from "@/modules/identity/identity.service"
import { requirePermission } from "@/utils/authorization"
import { ok } from "@/utils/response"
import { ProjectService } from "./project.service"
import { projectRepository, type ProjectRepository } from "./project.repository"
import {
  idParam,
  versionBody,
  projectBody,
  contractBody,
  teamBody,
  pointBody,
  memberBody,
  indicatorBody,
  allocationBody,
  quantity,
  listQuery,
} from "./project.validation"
const indicatorParam = t.Object({
  ...idParam.properties,
  indicatorId: t.Numeric({ minimum: 1, multipleOf: 1 }),
})
/** 项目路由负责字段校验及响应，业务授权和状态转换由服务层执行。 */
export function createProjectRoutes(
  repository: ProjectRepository = projectRepository,
  identities: IdentityService = identityService,
  prefix = "/projects",
) {
  const service = new ProjectService(repository)
  return new Elysia({ prefix, tags: ["服务管理"] })
    .use(createAuthentication(identities))
    .get(
      "",
      async ({ authenticate, query }) => ok(await service.list(await authenticate(), query)),
      { query: listQuery },
    )
    .get(
      "/candidates",
      async ({ authenticate, query }) =>
        ok(
          await service.candidates(await authenticate(), query.projectId, query.kind, query.teamId),
        ),
      {
        query: t.Object({
          projectId: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
          kind: t.Optional(
            t.Union([
              t.Literal("filters"),
              t.Literal("configuration"),
              t.Literal("users"),
              t.Literal("teams"),
              t.Literal("organizations"),
            ]),
          ),
          teamId: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
        }),
      },
    )
    .post(
      "",
      async ({ authenticate, body }) => ok(await service.create(await authenticate(), body)),
      { body: projectBody },
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
        return ok(await service.update(await authenticate(), params.id, input, version))
      },
      { params: idParam, body: t.Object({ ...projectBody.properties, ...versionBody.properties }) },
    )
    .delete(
      "/:id",
      async ({ authenticate, params, query }) =>
        ok(await service.state(await authenticate(), params.id, query.version, "delete")),
      { params: idParam, query: t.Object({ version: t.Numeric({ minimum: 1, multipleOf: 1 }) }) },
    )
    .post(
      "/:id/activate",
      async ({ authenticate, params, body }) =>
        ok(await service.state(await authenticate(), params.id, body.version, "activate")),
      { params: idParam, body: versionBody },
    )
    .get(
      "/:id/contract",
      async ({ authenticate, params }) =>
        ok((await service.detail(await authenticate(), params.id)).contract),
      { params: idParam },
    )
    .put(
      "/:id/contract",
      async ({ authenticate, params, body }) => {
        const { version, ...input } = body
        return ok(await service.contract(await authenticate(), params.id, input, version))
      },
      {
        params: idParam,
        body: t.Object({ ...contractBody.properties, ...versionBody.properties }),
      },
    )
    .get(
      "/:id/teams",
      async ({ authenticate, params }) =>
        ok((await service.detail(await authenticate(), params.id)).teams),
      { params: idParam },
    )
    .put(
      "/:id/teams",
      async ({ authenticate, params, body }) =>
        ok(await service.teams(await authenticate(), params.id, body.teams, body.version)),
      { params: idParam, body: t.Object({ version: t.Integer({ minimum: 1 }), teams: teamBody }) },
    )
    .put(
      "/:id/members",
      async ({ authenticate, params, body }) =>
        ok(await service.members(await authenticate(), params.id, body.members, body.version)),
      {
        params: idParam,
        body: t.Object({ version: t.Integer({ minimum: 1 }), members: memberBody }),
      },
    )
    .get(
      "/:id/service-points",
      async ({ authenticate, params }) =>
        ok((await service.detail(await authenticate(), params.id)).servicePoints),
      { params: idParam },
    )
    .put(
      "/:id/service-points",
      async ({ authenticate, params, body }) =>
        ok(await service.points(await authenticate(), params.id, body.points, body.version)),
      {
        params: idParam,
        body: t.Object({ version: t.Integer({ minimum: 1 }), points: pointBody }),
      },
    )
    .get(
      "/:id/indicators",
      async ({ authenticate, params }) => {
        const actor = await authenticate()
        requirePermission(actor, "service:indicator:view")
        return ok((await service.detail(actor, params.id)).indicators)
      },
      { params: idParam },
    )
    .post(
      "/:id/indicators",
      async ({ authenticate, params, body }) =>
        ok(await service.indicator(await authenticate(), params.id, body)),
      { params: idParam, body: indicatorBody },
    )
    .put(
      "/:id/indicators/:indicatorId",
      async ({ authenticate, params, body }) => {
        const { version, ...input } = body
        return ok(
          await service.indicator(
            await authenticate(),
            params.id,
            input,
            params.indicatorId,
            version,
          ),
        )
      },
      {
        params: indicatorParam,
        body: t.Object({ ...indicatorBody.properties, ...versionBody.properties }),
      },
    )
    .delete(
      "/:id/indicators/:indicatorId",
      async ({ authenticate, params, query }) =>
        ok(
          await service.indicatorState(
            await authenticate(),
            params.id,
            params.indicatorId,
            query.version,
            "delete",
          ),
        ),
      {
        params: indicatorParam,
        query: t.Object({ version: t.Numeric({ minimum: 1, multipleOf: 1 }) }),
      },
    )
    .put(
      "/:id/indicators/:indicatorId/allocations",
      async ({ authenticate, params, body }) =>
        ok(
          await service.allocations(
            await authenticate(),
            params.id,
            params.indicatorId,
            body.targets,
            body.version,
          ),
        ),
      {
        params: indicatorParam,
        body: t.Object({ version: t.Integer({ minimum: 1 }), targets: allocationBody }),
      },
    )
    .post(
      "/:id/indicators/:indicatorId/activate",
      async ({ authenticate, params, body }) =>
        ok(
          await service.indicatorState(
            await authenticate(),
            params.id,
            params.indicatorId,
            body.version,
            "activate",
          ),
        ),
      { params: indicatorParam, body: versionBody },
    )
    .put(
      "/:id/indicators/:indicatorId/target-plan",
      async ({ authenticate, params, body }) =>
        ok(
          await service.allocations(
            await authenticate(),
            params.id,
            params.indicatorId,
            body.targets,
            body.version,
            body.targetValue,
            body.reason,
          ),
        ),
      {
        params: indicatorParam,
        body: t.Object({
          version: t.Integer({ minimum: 1 }),
          targetValue: quantity,
          reason: t.String({ minLength: 1, maxLength: 1000 }),
          targets: allocationBody,
        }),
      },
    )
}
