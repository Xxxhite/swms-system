import { QualityService } from "./quality.service"
import { qualityParam, qualityQuery } from "./quality.validation"
import { FeedbackRepository } from "@/modules/feedback/feedback.repository"
import { reportParam, reportQuery } from "./management.validation"
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
  const quality = new QualityService(new FeedbackRepository(repository.database))
  return new Elysia({ prefix: "/analysis", tags: ["数据分析"] })
    .use(createAuthentication(identities))
    .get(
      "/quality/:kind",
      async ({ authenticate, params, query }) =>
        ok(await quality.report(await authenticate(), params.kind, query)),
      { params: qualityParam, query: qualityQuery },
    )
    .get(
      "/quality/:kind/details",
      async ({ authenticate, params, query }) =>
        ok(await quality.report(await authenticate(), params.kind, query, "details")),
      { params: qualityParam, query: qualityQuery },
    )
    .get(
      "/quality/:kind/export",
      async ({ authenticate, params, query }) =>
        new Response(
          (await quality.report(
            await authenticate(),
            params.kind,
            query,
            "export",
          )) as Uint8Array<ArrayBuffer>,
          {
            headers: {
              "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "Content-Disposition": `attachment; filename="quality-${params.kind}.xlsx"`,
            },
          },
        ),
      { params: qualityParam, query: qualityQuery },
    )
    .get(
      "/management/:report",
      async ({ authenticate, params, query }) =>
        ok(await service.management(await authenticate(), params.report, query)),
      { params: reportParam, query: reportQuery },
    )
    .get(
      "/management/:report/details",
      async ({ authenticate, params, query }) =>
        ok(await service.management(await authenticate(), params.report, query, "details")),
      { params: reportParam, query: reportQuery },
    )
    .get(
      "/management/:report/export",
      async ({ authenticate, params, query }) =>
        new Response(
          (await service.management(
            await authenticate(),
            params.report,
            query,
            "export",
          )) as Uint8Array<ArrayBuffer>,
          {
            headers: {
              "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "Content-Disposition": `attachment; filename="management-${params.report}.xlsx"`,
            },
          },
        ),
      { params: reportParam, query: reportQuery },
    )
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
