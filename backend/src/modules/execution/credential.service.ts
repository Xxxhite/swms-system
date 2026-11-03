import { createHash, createHmac, randomBytes } from "node:crypto"
import {
  projectRepository,
  type ProjectRepository,
  type BusinessState,
} from "@/modules/project/project.repository"
import { actorFrom } from "@/modules/identity/identity.service"
import type { Actor } from "@/utils/authorization"
import { AppError, ErrorCode } from "@/utils/errors"
import { businessAudit } from "@/utils/business-audit"
import { fingerprint } from "@/modules/task/task-calendar"
import { env } from "@/utils/env"
import { executionTask } from "./execution.authorization"
import { participantWorker, rosterFor, recordParticipation } from "./participant.service"
import {
  executionWrite,
  safeExecution,
  openExecution,
  policyFor,
  withinWindow,
  sourceVersion,
} from "./execution.shared"
import type { PublicConfirmInput } from "./execution.validation"
export function credentialHash(token: string) {
  return createHash("sha256").update(token).digest("hex")
}
function credentialValue(row: {
  nonce: string
  taskId: number
  rosterId: number
  issuerId: number
  requestKey: string
}) {
  if (env.jwtSecret.length < 32) throw new AppError(ErrorCode.INTERNAL, "凭证服务配置尚未就绪")
  // 随机nonce只提供重试输入，生成密钥仅在服务器；数据库不保存可直接使用的凭证。
  return createHmac("sha256", env.jwtSecret)
    .update(
      `execution-credential:v1:${row.nonce}:${row.taskId}:${row.rosterId}:${row.issuerId}:${row.requestKey}`,
    )
    .digest("base64url")
}
function publicCredential(data: BusinessState, hash: string, now: Date) {
  const c = data.executions.credentials.find((c) => c.tokenHash === hash),
    t = data.scheduling.tasks.find((t) => t.id === c?.taskId)
  const fail = () => {
    throw AppError.notFound("参与凭证无效或已失效")
  }
  if (
    !c ||
    !t ||
    c.status === "REVOKED" ||
    c.expiresAt <= now ||
    t.status === "CANCELED" ||
    t.version !== c.taskVersion
  )
    return fail()
  try {
    openExecution(data, t)
    withinWindow(t, policyFor(data, t), now)
  } catch {
    return fail()
  }
  const issuer = data.identity.users.find(
    (u) => u.id === c.issuerId && u.status === "ACTIVE" && u.authVersion === c.issuerAuthVersion,
  )
  if (!issuer) return fail()
  try {
    participantWorker(data, actorFrom(data.identity, issuer), t, "service:credential:issue", now)
  } catch {
    return fail()
  }
  const r = data.executions.rosters.find((r) => r.id === c.rosterId && r.taskId === t.id),
    person = data.executions.participants.find(
      (p) => p.id === r?.participantId && p.projectId === t.projectId && p.status === "ACTIVE",
    )
  if (!r || !person || c.purpose !== (t.form === "HOME_VISIT" ? "HOME_CONFIRM" : "COLLECTIVE"))
    return fail()
  return { credential: c, task: t, roster: r, person }
}
export class CredentialService {
  constructor(
    readonly repository: ProjectRepository = projectRepository,
    readonly now: () => Date = () => new Date(),
  ) {}
  issue(
    actor: Actor,
    taskId: number,
    input: {
      rosterId: number
      purpose: "COLLECTIVE" | "HOME_CONFIRM"
      requestKey: string
      sourceVersion: number
    },
  ) {
    return executionWrite(this.repository, actor, async (tx, data, current) => {
      const t = executionTask(data, current, taskId, "service:credential:issue"),
        now = this.now()
      participantWorker(data, current, t, "service:credential:issue", now)
      openExecution(data, t)
      withinWindow(t, policyFor(data, t), now)
      const { person } = rosterFor(data, t, input.rosterId)
      if (person.status !== "ACTIVE") throw AppError.conflict("对象已归档")
      if (input.purpose !== (t.form === "HOME_VISIT" ? "HOME_CONFIRM" : "COLLECTIVE"))
        throw AppError.badRequest("凭证用途与本任务服务形式不符")
      const hash = fingerprint({ taskId, input }),
        old = data.executions.credentials.find(
          (c) => c.issuerId === current.user.id && c.requestKey === input.requestKey,
        )
      if (old) {
        if (old.fingerprint !== hash || old.status === "REVOKED" || old.expiresAt <= now)
          throw AppError.conflict("凭证请求已变化或失效，请重新发放")
        const token = credentialValue(old)
        if (credentialHash(token) !== old.tokenHash)
          throw AppError.conflict("凭证配置已变化，请重新发放")
        return { id: old.id, token, expiresAt: old.expiresAt, replayed: true }
      }
      sourceVersion(data, taskId, input.sourceVersion)
      for (const c of data.executions.credentials.filter(
        (c) => c.rosterId === input.rosterId && c.status !== "REVOKED",
      ))
        await tx.executions.credentials.update(c.id, { status: "REVOKED", version: c.version + 1 })
      const policy = policyFor(data, t),
        expiresAt = new Date(
          Math.min(
            now.getTime() + policy.credentialMinutes * 60000,
            t.endAt.getTime() + policy.afterMinutes * 60000,
          ),
        )
      const values = {
          taskId,
          rosterId: input.rosterId,
          purpose: input.purpose,
          nonce: randomBytes(32).toString("hex"),
          taskVersion: t.version,
          issuerId: current.user.id,
          issuerAuthVersion: current.user.authVersion,
          requestKey: input.requestKey,
          fingerprint: hash,
          expiresAt,
        },
        token = credentialValue(values)
      const id = await tx.executions.credentials.insert({
        ...values,
        tokenHash: credentialHash(token),
      })
      await businessAudit(
        tx,
        current.user.id,
        "issue-participation-credential",
        "execution",
        taskId,
        null,
        { credentialId: id, rosterId: input.rosterId, purpose: input.purpose, expiresAt },
      )
      return { id, token, expiresAt, replayed: false }
    })
  }
  revoke(actor: Actor, taskId: number, id: number, reason: string) {
    return executionWrite(this.repository, actor, async (tx, data, current) => {
      const t = executionTask(data, current, taskId, "service:credential:issue")
      participantWorker(data, current, t, "service:credential:issue", this.now())
      const c = data.executions.credentials.find((c) => c.taskId === taskId && c.id === id)
      if (!c) throw AppError.notFound()
      if (!reason.trim()) throw AppError.badRequest("请填写撤销原因")
      if (c.status !== "REVOKED")
        await tx.executions.credentials.update(id, { status: "REVOKED", version: c.version + 1 })
      await businessAudit(
        tx,
        current.user.id,
        "revoke-participation-credential",
        "execution",
        taskId,
        null,
        { credentialId: id, reason },
      )
      return { id }
    })
  }
  resolve(token: string) {
    return safeExecution(() =>
      this.repository.publicExecution(credentialHash(token), async (_tx, data) => {
        const {
            credential: c,
            task: t,
            person,
            roster,
          } = publicCredential(data, credentialHash(token), this.now()),
          fact = data.executions.participations.find((f) => f.rosterId === roster.id)
        return {
          title: t.title,
          date: t.startAt.toISOString(),
          name: person.name.slice(0, 1) + "*",
          purpose: c.purpose,
          expiresAt: c.expiresAt,
          recorded: fact?.status === "RECORDED",
          canConfirm: c.status === "ACTIVE" && fact?.status !== "RECORDED",
        }
      }),
    )
  }
  confirm(input: PublicConfirmInput) {
    return safeExecution(() =>
      this.repository.publicExecution(credentialHash(input.token), async (tx, data) => {
        const now = this.now(),
          {
            credential: c,
            task: t,
            roster,
          } = publicCredential(data, credentialHash(input.token), now)
        if (c.purpose === "COLLECTIVE" && input.confirmerRole !== "SELF")
          throw AppError.badRequest("本参与凭证用于本人确认")
        if (input.confirmerRole !== "SELF" && !input.relation.trim())
          throw AppError.badRequest("请填写与服务对象的关系")
        const hash = fingerprint({
            credentialId: c.id,
            role: input.confirmerRole,
            relation: input.relation.trim(),
          }),
          fact = data.executions.participations.find((p) => p.rosterId === roster.id)
        if (c.status === "USED") {
          const old = data.executions.participationEvents.find((e) => e.id === c.usedEventId)
          if (
            !old ||
            old.fingerprint !== hash ||
            fact?.status !== "RECORDED" ||
            fact.currentEventId !== old.id
          )
            throw AppError.conflict("参与来源已调整，请工作人员核对或重新发放")
          return { recorded: true, replayed: true }
        }
        if (fact?.status === "RECORDED") throw AppError.conflict("本次参与已经登记，请工作人员核对")
        const result = await recordParticipation(tx, data, t, roster.id, {
          kind: fact ? "CORRECT" : "CONFIRM",
          method: input.confirmerRole === "SELF" ? "SELF" : "FAMILY",
          actorId: null,
          credentialId: c.id,
          confirmerRole: input.confirmerRole,
          relation: input.relation.trim(),
          reason: fact ? "个人凭证重新确认" : "个人凭证确认",
          occurredAt: now,
          receivedAt: now,
          requestKey: input.requestKey,
          requestOwner: `CREDENTIAL:${c.id}`,
          hash,
          evidenceIds: [],
        })
        await tx.executions.credentials.update(c.id, {
          status: "USED",
          usedEventId: result.id,
          version: c.version + 1,
        })
        return { recorded: true, replayed: false }
      }),
    )
  }
}
