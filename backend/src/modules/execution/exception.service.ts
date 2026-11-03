import { projectRepository, type ProjectRepository } from "@/modules/project/project.repository"
import { requirePermission, assertVersion, type Actor } from "@/utils/authorization"
import { AppError } from "@/utils/errors"
import { businessAudit } from "@/utils/business-audit"
import { actualArranger } from "./execution.authorization"
import { executionRead, executionWrite, bindEvidence, touchExecution } from "./execution.shared"
import { exceptionLabels } from "./execution-geo"
export class ExceptionService {
  constructor(
    readonly repository: ProjectRepository = projectRepository,
    readonly now: () => Date = () => new Date(),
  ) {}
  list(actor: Actor) {
    return executionRead(this.repository, actor, (data) => {
      const current = data.actor!
      requirePermission(current, "service:exception:view")
      return data.executions.exceptions
        .filter((e) => {
          const t = data.scheduling.tasks.find((t) => t.id === e.taskId)
          return (
            e.ownerId === current.user.id ||
            e.reviewerId === current.user.id ||
            (!!t && actualArranger(data, current, t))
          )
        })
        .map((e) => {
          const t = data.scheduling.tasks.find((t) => t.id === e.taskId),
            staff =
              e.sourceKind === "STAFF"
                ? data.executions.staffEvents.find((s) => s.id === e.sourceId)
                : undefined
          return {
            ...e,
            label: exceptionLabels[e.code] ?? e.code,
            title: t?.title,
            ownerName: data.identity.users.find((u) => u.id === e.ownerId)?.name,
            reviewerName: data.identity.users.find((u) => u.id === e.reviewerId)?.name,
            source: staff
              ? {
                  kind: staff.kind,
                  occurredAt: staff.occurredAt,
                  receivedAt: staff.receivedAt,
                  geo: staff.geo,
                  distance: staff.distance,
                  reason: staff.reason,
                }
              : null,
            evidence: data.executions.evidence
              .filter(
                (f) =>
                  !f.deletedAt &&
                  ((f.boundKind === "EXCEPTION" && f.boundId === e.id) ||
                    (f.taskId === e.taskId &&
                      f.boundKind === e.sourceKind &&
                      f.boundId === e.sourceId)),
              )
              .map((f) => ({ id: f.id, name: f.name })),
          }
        })
    })
  }
  explain(
    actor: Actor,
    id: number,
    input: { version: number; requestKey: string; reason: string; evidenceIds: number[] },
  ) {
    return executionWrite(this.repository, actor, async (tx, data, current) => {
      requirePermission(current, "service:exception:explain")
      const e = data.executions.exceptions.find((e) => e.id === id && e.ownerId === current.user.id)
      if (!e) throw AppError.notFound()
      const old = e.notes.find((n) => n.requestKey === input.requestKey)
      if (old) {
        if (
          old.reason !== input.reason.trim() ||
          JSON.stringify(old.evidenceIds) !== JSON.stringify(input.evidenceIds)
        )
          throw AppError.conflict("说明请求标识已被使用")
        return { id }
      }
      assertVersion(e.version, input.version)
      if (e.status === "RESOLVED") throw AppError.conflict("该异常已由后续原始事件解决")
      if (!input.reason.trim()) throw AppError.badRequest("请填写异常说明")
      if (e.notes.length >= 100) throw AppError.conflict("该项说明已达上限，请联系主管核对")
      await bindEvidence(tx, data, current.user.id, e.taskId, input.evidenceIds, "EXCEPTION", id)
      await tx.executions.exceptions.update(id, {
        notes: [
          ...e.notes,
          {
            actorId: current.user.id,
            reason: input.reason.trim(),
            createdAt: this.now().toISOString(),
            requestKey: input.requestKey,
            evidenceIds: input.evidenceIds,
          },
        ],
        status: "EXPLAINED",
        version: e.version + 1,
      })
      const sourceVersion = await touchExecution(tx, data, e.taskId)
      await businessAudit(
        tx,
        current.user.id,
        "explain-execution-exception",
        "execution",
        e.taskId,
        null,
        { exceptionId: id },
      )
      return { id, sourceVersion }
    })
  }
}
