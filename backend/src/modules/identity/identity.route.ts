import { Elysia, t } from "elysia"
import { createAuthentication } from "@/plugins/auth"
import { ok } from "@/utils/response"
import { AppError } from "@/utils/errors"
import { dictionaries } from "./identity.constants"
import { identityService, type IdentityService } from "./identity.service"
import {
  authorizationFields,
  idParams,
  listQuery,
  orgFields,
  placementFields,
  roleFields,
  text,
  nullableText,
  version,
} from "./identity.validation"

/** 创建组织、人员、注册审核和角色路由；本层声明参数规则，业务校验交给服务层。 */
export function createIdentityRoutes(service: IdentityService = identityService) {
  return new Elysia({ tags: ["系统管理"] })
    .use(createAuthentication(service))
    .get("/orgs/tree", async ({ authenticate }) => ok(await service.orgs(await authenticate())))
    .post(
      "/orgs",
      async ({ authenticate, body }) => ok(await service.saveOrg(await authenticate(), null, body)),
      { body: t.Object(orgFields) },
    )
    .put(
      "/orgs/:id",
      async ({ authenticate, body, params }) =>
        ok(await service.saveOrg(await authenticate(), params.id, body)),
      { params: idParams, body: t.Object({ ...orgFields, ...version }) },
    )
    .delete(
      "/orgs/:id",
      async ({ authenticate, params, query }) =>
        ok(await service.deleteOrg(await authenticate(), params.id, query.version)),
      { params: idParams, query: t.Object({ version: t.Numeric({ minimum: 1, multipleOf: 1 }) }) },
    )
    .get("/dictionaries/:type", async ({ authenticate, params }) => {
      await authenticate()
      if (!Object.hasOwn(dictionaries, params.type)) throw AppError.notFound()
      return ok(dictionaries[params.type as keyof typeof dictionaries])
    })
    .get(
      "/users",
      async ({ authenticate, query }) =>
        ok(
          await service.listUsers(await authenticate(), {
            ...query,
            page: query.page ?? 1,
            pageSize: query.pageSize ?? 20,
          }),
        ),
      { query: listQuery },
    )
    .get(
      "/users/:id",
      async ({ authenticate, params }) => ok(await service.user(await authenticate(), params.id)),
      { params: idParams },
    )
    .put(
      "/users/:id",
      async ({ authenticate, params, body }) =>
        ok(await service.updateUser(await authenticate(), params.id, body)),
      {
        params: idParams,
        body: t.Object({
          ...version,
          ...placementFields,
          name: text(50),
          phone: text(32),
          socialWorkerNo: nullableText(),
          serviceFieldCode: nullableText(),
        }),
      },
    )
    .put(
      "/users/:id/status",
      async ({ authenticate, params, body }) =>
        ok(await service.status(await authenticate(), params.id, body)),
      {
        params: idParams,
        body: t.Object({
          ...version,
          status: t.Union([t.Literal("ACTIVE"), t.Literal("DISABLED"), t.Literal("LEFT")]),
        }),
      },
    )
    .put(
      "/users/:id/authorization",
      async ({ authenticate, params, body }) =>
        ok(await service.authorize(await authenticate(), params.id, body)),
      { params: idParams, body: t.Object({ ...version, ...authorizationFields }) },
    )
    .get(
      "/registrations",
      async ({ authenticate, query }) =>
        ok(
          await service.listUsers(
            await authenticate(),
            { ...query, page: query.page ?? 1, pageSize: query.pageSize ?? 20 },
            true,
          ),
        ),
      { query: listQuery },
    )
    .get(
      "/registrations/:id",
      async ({ authenticate, params }) =>
        ok(await service.user(await authenticate(), params.id, true)),
      { params: idParams },
    )
    .post(
      "/registrations/:id/approve",
      async ({ authenticate, params, body }) =>
        ok(await service.approve(await authenticate(), params.id, body)),
      {
        params: idParams,
        body: t.Object({ ...version, ...placementFields, ...authorizationFields }),
      },
    )
    .post(
      "/registrations/:id/reject",
      async ({ authenticate, params, body }) =>
        ok(await service.reject(await authenticate(), params.id, body)),
      { params: idParams, body: t.Object({ ...version, comment: text(1000) }) },
    )
    .get("/roles", async ({ authenticate }) => ok(await service.roleList(await authenticate())))
    .post(
      "/roles",
      async ({ authenticate, body }) =>
        ok(await service.saveRole(await authenticate(), null, body)),
      { body: t.Object(roleFields) },
    )
    .put(
      "/roles/:id",
      async ({ authenticate, params, body }) =>
        ok(await service.saveRole(await authenticate(), params.id, body)),
      { params: idParams, body: t.Object({ ...version, ...roleFields }) },
    )
    .delete(
      "/roles/:id",
      async ({ authenticate, params, query }) =>
        ok(await service.deleteRole(await authenticate(), params.id, query.version)),
      { params: idParams, query: t.Object({ version: t.Numeric({ minimum: 1, multipleOf: 1 }) }) },
    )
    .get(
      "/roles/:id/permissions",
      async ({ authenticate, params }) => {
        const role = (await service.roleList(await authenticate())).find(
          (item) => item.id === params.id,
        )
        if (!role) throw AppError.notFound()
        return ok({ permissionCodes: role.permissionCodes, version: role.version })
      },
      { params: idParams },
    )
    .put(
      "/roles/:id/permissions",
      async ({ authenticate, params, body }) =>
        ok(
          await service.rolePermissions(
            await authenticate(),
            params.id,
            body.permissionCodes,
            body.version,
          ),
        ),
      {
        params: idParams,
        body: t.Object({ ...version, permissionCodes: t.Array(text(), { maxItems: 100 }) }),
      },
    )
    .get("/permissions", async ({ authenticate }) =>
      ok(await service.permissionList(await authenticate())),
    )
}
