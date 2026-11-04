import { outcomeAccess } from "@/modules/outcome/outcome.authorization"
import { mkdir, unlink } from "node:fs/promises"
import { basename, resolve } from "node:path"
import {
  projectRepository,
  type ProjectRepository,
  type BusinessState,
} from "@/modules/project/project.repository"
import { requirePermission, type Actor } from "@/utils/authorization"
import { AppError } from "@/utils/errors"
import { env } from "@/utils/env"
import { contractFileType } from "@/modules/file/file.validation"
import { businessAudit } from "@/utils/business-audit"
import { executionTask, assigned, canDetail } from "./execution.authorization"
import {
  executionRead,
  executionWrite,
  sessionFor,
  policyFor,
  withinWindow,
  supplementTime,
} from "./execution.shared"
type Evidence = BusinessState["executions"]["evidence"][number]
export function evidenceDto(f: Evidence) {
  return {
    id: f.id,
    taskId: f.taskId,
    name: f.name,
    size: f.size,
    contentType: f.contentType,
    sha256: f.sha256,
    uploadedBy: f.uploadedBy,
    boundKind: f.boundKind,
    boundId: f.boundId,
    createdAt: f.createdAt,
  }
}
export function evidenceAllowed(data: BusinessState, actor: Actor, f: Evidence) {
  if (f.deletedAt) return false
  const t = data.scheduling.tasks.find((t) => t.id === f.taskId)
  if (!t) return false
  if (!f.boundKind) return f.uploadedBy === actor.user.id && canDetail(data, actor, t)
  if (canDetail(data, actor, t)) return true
  if (
    data.outcomes.snapshots.some(
      (frame) =>
        frame.data.evidence.some((file) => file.id === f.id) &&
        data.instances.some(
          (i) =>
            (i.businessSnapshot as Record<string, unknown>).outcomeSnapshotId === frame.id &&
            (i.applicantId === actor.user.id ||
              data.tasks.some(
                (task) => task.instanceId === i.id && task.approverId === actor.user.id,
              )),
        ),
    )
  )
    return true
  return data.executions.exceptions.some(
    (e) =>
      e.taskId === f.taskId &&
      e.reviewerId === actor.user.id &&
      (f.boundKind === "EXCEPTION"
        ? e.id === f.boundId
        : e.sourceKind === f.boundKind && e.sourceId === f.boundId),
  )
}
export class EvidenceService {
  constructor(
    readonly repository: ProjectRepository = projectRepository,
    readonly directory = env.executionUploadDir,
    readonly now: () => Date = () => new Date(),
  ) {}
  list(actor: Actor, taskId: number) {
    return executionRead(this.repository, actor, (data) => {
      const current = data.actor!,
        t = executionTask(data, current, taskId, "service:evidence:view")
      if (!canDetail(data, current, t)) throw AppError.forbidden()
      return data.executions.evidence
        .filter((f) => f.taskId === taskId && evidenceAllowed(data, current, f))
        .map(evidenceDto)
    })
  }
  async upload(actor: Actor, taskId: number, file: File, requestKey: string, forOutcome = false) {
    if (!file.size || file.size > env.executionUploadMaxBytes)
      throw AppError.badRequest("现场凭证须大于0且不超过配置的大小上限")
    const name = basename(file.name.replaceAll("\\", "/"))
        .split("")
        .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
        .join("")
        .slice(0, 255),
      bytes = new Uint8Array(await file.arrayBuffer()),
      contentType = contractFileType(name, bytes)
    if (!["image/jpeg", "image/png", "application/pdf"].includes(contentType))
      throw AppError.badRequest("现场凭证支持JPEG、PNG及PDF")
    const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
      storageKey = crypto.randomUUID(),
      disk = resolve(this.directory, storageKey)
    let saved = false
    try {
      return await executionWrite(this.repository, actor, async (tx, data, current) => {
        const t = executionTask(data, current, taskId, "service:evidence:upload"),
          session = sessionFor(data, taskId),
          now = this.now()
        if (t.status === "CANCELED" && !session)
          throw AppError.conflict("任务已取消且没有可补录的执行来源")
        if (forOutcome) outcomeAccess(data, current, taskId, "service:monthly:update", true)
        else {
          const at = new Date(
            Math.min(Math.max(now.getTime(), t.startAt.getTime()), t.endAt.getTime() - 1),
          )
          assigned(
            data,
            current,
            t,
            "service:evidence:upload",
            at,
            !!session && session.status !== "IN_PROGRESS",
          )
          if (
            session &&
            (session.status !== "IN_PROGRESS" ||
              now.getTime() > t.endAt.getTime() + policyFor(data, t).afterMinutes * 60000)
          )
            supplementTime(data, t, session.status === "STOPPED" ? session.endedAt! : at, now)
          else withinWindow(t, policyFor(data, t), now)
        }
        const old = data.executions.evidence.find(
          (f) => f.uploadedBy === current.user.id && f.requestKey === requestKey,
        )
        if (old) {
          if (old.taskId !== taskId || old.sha256 !== sha256 || old.name !== name || old.deletedAt)
            throw AppError.conflict("上传请求标识已变化或被移除")
          return evidenceDto(old)
        }
        await mkdir(resolve(this.directory), { recursive: true })
        await Bun.write(disk, bytes)
        saved = true
        const id = await tx.executions.evidence.insert({
          taskId,
          uploadedBy: current.user.id,
          name,
          contentType,
          size: bytes.length,
          sha256,
          storageKey,
          requestKey,
        })
        await businessAudit(
          tx,
          current.user.id,
          "upload-execution-evidence",
          "execution",
          taskId,
          null,
          { evidenceId: id, size: bytes.length, contentType },
        )
        return {
          id,
          taskId,
          name,
          contentType,
          size: bytes.length,
          sha256,
          uploadedBy: current.user.id,
          boundKind: null,
          boundId: null,
          createdAt: now,
        }
      })
    } catch (error) {
      if (saved) await unlink(disk).catch(() => {})
      throw error
    }
  }
  async download(actor: Actor, id: number) {
    const metadata = await executionWrite(this.repository, actor, async (tx, data, current) => {
      requirePermission(current, "service:evidence:view")
      const f = data.executions.evidence.find((f) => f.id === id)
      if (!f || !evidenceAllowed(data, current, f)) throw AppError.notFound()
      await businessAudit(
        tx,
        current.user.id,
        "download-execution-evidence",
        "execution",
        f.taskId,
        null,
        { evidenceId: id },
      )
      return f
    })
    const file = Bun.file(resolve(this.directory, metadata.storageKey))
    if (!(await file.exists())) throw AppError.notFound("凭证文件缺失，请联系维护人员")
    if (
      new Bun.CryptoHasher("sha256").update(await file.arrayBuffer()).digest("hex") !==
      metadata.sha256
    )
      throw AppError.conflict("凭证文件校验失败，请联系维护人员")
    return new Response(file, {
      headers: {
        "content-type": metadata.contentType,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(metadata.name)}`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    })
  }
  async remove(actor: Actor, id: number) {
    const f = await executionWrite(this.repository, actor, async (tx, data, current) => {
      requirePermission(current, "service:evidence:upload")
      const f = data.executions.evidence.find(
        (f) => f.id === id && !f.deletedAt && f.uploadedBy === current.user.id,
      )
      if (!f) throw AppError.notFound()
      if (f.boundKind) throw AppError.conflict("已绑定凭证保留原始历史，请补充新凭证")
      await tx.executions.evidence.update(id, { deletedAt: this.now(), version: f.version + 1 })
      await businessAudit(
        tx,
        current.user.id,
        "remove-unbound-execution-evidence",
        "execution",
        f.taskId,
        null,
        { evidenceId: id },
      )
      return f
    })
    await unlink(resolve(this.directory, f.storageKey)).catch(() => {})
    return { id }
  }
}
