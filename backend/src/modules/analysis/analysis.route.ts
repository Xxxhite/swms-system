import { Elysia, t } from "elysia"
import { createAuthentication } from "@/plugins/auth"
import { identityService, type IdentityService } from "@/modules/identity/identity.service"
import { ok } from "@/utils/response"
import { projectRepository, type ProjectRepository } from "@/modules/project/project.repository"
import { listQuery } from "@/modules/project/project.validation"
import { AnalysisService } from "./analysis.service"
/** Excel 成功返回受控文件流，所有失败继续由统一 JSON 错误插件处理。 */
export function createAnalysisRoutes(
  repository: ProjectRepository = projectRepository,
  identities: IdentityService = identityService,
) {
  const service = new AnalysisService(repository)
  return new Elysia({ prefix: "/analysis", tags: ["数据分析"] })
    .use(createAuthentication(identities))
    .get(
      "/monthly-warnings",
      async ({ authenticate, query }) => ok(await service.warnings(await authenticate(), query)),
      { query: listQuery },
    )
    .get(
      "/indicators",
      async ({ authenticate, query }) => ok(await service.warnings(await authenticate(), query)),
      { query: listQuery },
    )
    .get(
      "/exports/:report",
      async ({ authenticate, query }) =>
        new Response((await service.export(await authenticate(), query)).buffer as ArrayBuffer, {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": 'attachment; filename="indicator-report.xlsx"',
          },
        }),
      {
        query: listQuery,
        params: t.Object({
          report: t.Union([t.Literal("monthly-warnings"), t.Literal("indicators")]),
        }),
      },
    )
}
