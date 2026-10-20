import { Elysia, t } from "elysia"
import { createAuthentication } from "@/plugins/auth"
import { identityService, type IdentityService } from "@/modules/identity/identity.service"
import { ok } from "@/utils/response"
import { SystemService } from "./system.service"
import { SystemRepository } from "./system.repository"
/** 创建系统日志查询路由，复用同一身份服务进行认证与管理员权限校验。 */
export function createSystemRoutes(identities: IdentityService = identityService) {
  const service = new SystemService(new SystemRepository(identities.repository))
  return new Elysia({ prefix: "/system", tags: ["系统管理"] })
    .use(createAuthentication(identities))
    .get(
      "/logs",
      async ({ authenticate, query }) =>
        ok(
          await service.logs(
            await authenticate(),
            { page: query.page ?? 1, pageSize: query.pageSize ?? 20 },
            query,
          ),
        ),
      {
        query: t.Object({
          page: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
          pageSize: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1, maximum: 100 })),
          actorId: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
          action: t.Optional(t.String({ maxLength: 100 })),
          entityType: t.Optional(t.String({ maxLength: 50 })),
          dateFrom: t.Optional(t.String({ format: "date" })),
          dateTo: t.Optional(t.String({ format: "date" })),
        }),
      },
    )
}
