import { env } from "@/utils/env"
import { Elysia, t } from "elysia"
import { createAuthentication } from "@/plugins/auth"
import { identityService, type IdentityService } from "@/modules/identity/identity.service"
import { projectRepository, type ProjectRepository } from "@/modules/project/project.repository"
import { idParam } from "@/modules/project/project.validation"
import { ok } from "@/utils/response"
import { EvidenceService } from "@/modules/execution/evidence.service"
import { OutcomeService } from "./outcome.service"
import { ruleBody, outcomeBody, outcomeSubmitBody } from "./outcome.validation"
export function createOutcomeRoutes(
  repository: ProjectRepository = projectRepository,
  identities: IdentityService = identityService,
  executionDirectory = env.executionUploadDir,
) {
  const service = new OutcomeService(repository),
    evidence = new EvidenceService(repository, executionDirectory)
  return new Elysia({ prefix: "/service", tags: ["服务管理"] })
    .use(createAuthentication(identities))
    .get(
      "/indicators/:id/calculation-rule",
      async ({ authenticate, params }) => ok(await service.rule(await authenticate(), params.id)),
      { params: idParam },
    )
    .put(
      "/indicators/:id/calculation-rule",
      async ({ authenticate, params, body }) =>
        ok(await service.saveRule(await authenticate(), params.id, body)),
      { params: idParam, body: ruleBody },
    )
    .get(
      "/tasks/:id/outcome",
      async ({ authenticate, params }) => ok(await service.detail(await authenticate(), params.id)),
      { params: idParam },
    )
    .post(
      "/tasks/:id/outcome",
      async ({ authenticate, params }) =>
        ok(await service.generate(await authenticate(), params.id)),
      { params: idParam },
    )
    .put(
      "/tasks/:id/outcome",
      async ({ authenticate, params, body }) =>
        ok(await service.save(await authenticate(), params.id, body)),
      { params: idParam, body: outcomeBody },
    )
    .post(
      "/tasks/:id/outcome/refresh",
      async ({ authenticate, params, body }) =>
        ok(await service.save(await authenticate(), params.id, body)),
      { params: idParam, body: outcomeBody },
    )
    .post(
      "/tasks/:id/outcome/preview",
      async ({ authenticate, params }) =>
        ok(await service.preview(await authenticate(), params.id)),
      { params: idParam },
    )
    .post(
      "/tasks/:id/outcome/submit",
      async ({ authenticate, params, body }) =>
        ok(await service.submit(await authenticate(), params.id, body)),
      { params: idParam, body: outcomeSubmitBody },
    )
    .post(
      "/tasks/:id/outcome/withdraw",
      async ({ authenticate, params }) =>
        ok(await service.withdrawSummary(await authenticate(), params.id)),
      { params: idParam },
    )
    .get(
      "/outcome-snapshots/:id",
      async ({ authenticate, params }) =>
        ok(await service.snapshot(await authenticate(), params.id)),
      { params: idParam },
    )
    .post(
      "/tasks/:id/outcome/evidence",
      async ({ authenticate, params, body }) =>
        ok(
          await evidence.upload(await authenticate(), params.id, body.file, body.requestKey, true),
        ),
      {
        params: idParam,
        body: t.Object({
          file: t.File({ maxSize: "10m" }),
          requestKey: t.String({ minLength: 1, maxLength: 64 }),
        }),
      },
    )
}
