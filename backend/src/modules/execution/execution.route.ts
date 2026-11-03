import { Elysia, t } from "elysia"
import { createAuthentication } from "@/plugins/auth"
import { identityService, type IdentityService } from "@/modules/identity/identity.service"
import { projectRepository, type ProjectRepository } from "@/modules/project/project.repository"
import { idParam, shortText } from "@/modules/project/project.validation"
import { ok } from "@/utils/response"
import { env } from "@/utils/env"
import { ExecutionService } from "./execution.service"
import { ParticipantService } from "./participant.service"
import { CredentialService } from "./credential.service"
import { EvidenceService } from "./evidence.service"
import { ExceptionService } from "./exception.service"
import {
  requestFields,
  lifecycleBody,
  attendanceBody,
  policyBody,
  participantBody,
  participationBody,
} from "./execution.validation"
const id = t.Integer({ minimum: 1 }),
  numeric = t.Numeric({ minimum: 1, multipleOf: 1 }),
  taskParams = t.Object({ ...idParam.properties, childId: numeric })
export function createExecutionRoutes(
  repository: ProjectRepository = projectRepository,
  identities: IdentityService = identityService,
  now: () => Date = () => new Date(),
  directory?: string,
) {
  const service = new ExecutionService(repository, now),
    participants = new ParticipantService(repository, now),
    credentials = new CredentialService(repository, now),
    evidence = new EvidenceService(repository, directory, now),
    exceptions = new ExceptionService(repository, now)
  const prefix = "/service/tasks/:id/execution"
  return new Elysia({ tags: ["现场执行"] })
    .use(createAuthentication(identities))
    .get(
      "/service/execution/my-tasks",
      async ({ authenticate, query }) => ok(await service.mine(await authenticate(), query)),
      {
        query: t.Object({
          page: t.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
          pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 100, multipleOf: 1 })),
        }),
      },
    )
    .get(
      prefix,
      async ({ authenticate, params }) => ok(await service.detail(await authenticate(), params.id)),
      { params: idParam },
    )
    .get(
      `${prefix}/policy`,
      async ({ authenticate, params }) => {
        const d = await service.detail(await authenticate(), params.id)
        return ok({
          policy: d.policy,
          version: d.policyVersion,
          taskVersion: d.taskVersion,
          stale: d.policyStale,
          canConfigure: d.canConfigure,
        })
      },
      { params: idParam },
    )
    .put(
      `${prefix}/policy`,
      async ({ authenticate, params, body }) =>
        ok(await service.savePolicy(await authenticate(), params.id, body)),
      { params: idParam, body: policyBody },
    )
    .post(
      `${prefix}/start`,
      async ({ authenticate, params, body }) =>
        ok(await service.start(await authenticate(), params.id, body)),
      { params: idParam, body: lifecycleBody },
    )
    .post(
      `${prefix}/end`,
      async ({ authenticate, params, body }) =>
        ok(await service.end(await authenticate(), params.id, body)),
      { params: idParam, body: lifecycleBody },
    )
    .post(
      `${prefix}/stop`,
      async ({ authenticate, params, body }) =>
        ok(await service.stop(await authenticate(), params.id, body)),
      {
        params: idParam,
        body: t.Object({ ...requestFields, reason: shortText(1000, "中止原因") }),
      },
    )
    .post(
      `${prefix}/attendance`,
      async ({ authenticate, params, body }) =>
        ok(await service.attendance(await authenticate(), params.id, body)),
      { params: idParam, body: attendanceBody },
    )
    .get(
      "/service/participants",
      async ({ authenticate, query }) =>
        ok(await participants.list(await authenticate(), query.taskId)),
      { query: t.Object({ taskId: numeric }) },
    )
    .post(
      "/service/participants",
      async ({ authenticate, body }) => ok(await participants.create(await authenticate(), body)),
      { body: participantBody },
    )
    .put(
      "/service/participants/:id",
      async ({ authenticate, params, body }) =>
        ok(await participants.update(await authenticate(), params.id, body)),
      {
        params: idParam,
        body: t.Object({
          taskId: id,
          version: id,
          name: shortText(100, "姓名或称呼"),
          phone: t.Optional(t.String({ maxLength: 50 })),
          reason: shortText(1000, "调整原因"),
        }),
      },
    )
    .post(
      "/service/participants/:id/archive",
      async ({ authenticate, params, body }) =>
        ok(await participants.update(await authenticate(), params.id, body, true)),
      {
        params: idParam,
        body: t.Object({
          taskId: id,
          version: id,
          name: shortText(100, "姓名或称呼"),
          reason: shortText(1000, "归档原因"),
        }),
      },
    )
    .get(
      `${prefix}/participants`,
      async ({ authenticate, params }) =>
        ok((await service.detail(await authenticate(), params.id)).rosters),
      { params: idParam },
    )
    .post(
      `${prefix}/participants`,
      async ({ authenticate, params, body }) =>
        ok(await participants.addRoster(await authenticate(), params.id, body.participantId)),
      { params: idParam, body: t.Object({ participantId: id }) },
    )
    .post(
      `${prefix}/participants/:childId/confirm`,
      async ({ authenticate, params, body }) =>
        ok(await participants.confirm(await authenticate(), params.id, params.childId, body)),
      { params: taskParams, body: participationBody },
    )
    .post(
      `${prefix}/participants/:childId/void`,
      async ({ authenticate, params, body }) =>
        ok(
          await participants.confirm(await authenticate(), params.id, params.childId, {
            ...body,
            kind: "VOID",
          }),
        ),
      { params: taskParams, body: participationBody },
    )
    .post(
      `${prefix}/credentials`,
      async ({ authenticate, params, body }) =>
        ok(await credentials.issue(await authenticate(), params.id, body)),
      {
        params: idParam,
        body: t.Object({
          ...requestFields,
          rosterId: id,
          purpose: t.Union([t.Literal("COLLECTIVE"), t.Literal("HOME_CONFIRM")]),
        }),
      },
    )
    .post(
      `${prefix}/credentials/:childId/revoke`,
      async ({ authenticate, params, body }) =>
        ok(await credentials.revoke(await authenticate(), params.id, params.childId, body.reason)),
      { params: taskParams, body: t.Object({ reason: shortText(1000, "撤销原因") }) },
    )
    .get(
      `${prefix}/evidence`,
      async ({ authenticate, params }) => ok(await evidence.list(await authenticate(), params.id)),
      { params: idParam },
    )
    .post(
      `${prefix}/evidence`,
      async ({ authenticate, params, body }) =>
        ok(await evidence.upload(await authenticate(), params.id, body.file, body.requestKey)),
      {
        params: idParam,
        body: t.Object({
          file: t.File({ maxSize: env.executionUploadMaxBytes }),
          requestKey: shortText(64, "上传请求标识"),
        }),
      },
    )
    .get(
      "/execution/evidence/:id/download",
      async ({ authenticate, params }) => evidence.download(await authenticate(), params.id),
      { params: idParam },
    )
    .delete(
      "/execution/evidence/:id",
      async ({ authenticate, params }) =>
        ok(await evidence.remove(await authenticate(), params.id)),
      { params: idParam },
    )
    .get("/execution/exceptions", async ({ authenticate }) =>
      ok(await exceptions.list(await authenticate())),
    )
    .post(
      "/execution/exceptions/:id/notes",
      async ({ authenticate, params, body }) =>
        ok(await exceptions.explain(await authenticate(), params.id, body)),
      {
        params: idParam,
        body: t.Object({
          version: id,
          requestKey: shortText(64, "请求标识"),
          reason: shortText(1000, "异常说明"),
          evidenceIds: t.Array(id, { maxItems: 10, uniqueItems: true }),
        }),
      },
    )
}
