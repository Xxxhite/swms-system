import { mkdir, unlink } from "node:fs/promises"
import { resolve, basename } from "node:path"
import { env } from "@/utils/env"
import { requirePermission, type Actor } from "@/utils/authorization"
import { assertBusinessAccess } from "@/utils/business-scope"
import { AppError } from "@/utils/errors"
import { businessAudit } from "@/utils/business-audit"
import { ProjectRepository, projectRepository } from "@/modules/project/project.repository"
import { manageProject, fullProject, visibleTeams } from "@/modules/project/project.service"
import { contractFileType } from "./file.validation"
/** 只输出附件展示字段，磁盘存储键和校验值不发送至浏览器。 */
function fileDto(file: {
  id: number
  name: string
  size: number
  contentType: string
  createdAt: Date
}) {
  return {
    id: file.id,
    name: file.name,
    size: file.size,
    contentType: file.contentType,
    createdAt: file.createdAt,
  }
}
/** 合同多附件服务：鉴权、持久化、下载及审计复用业务事务。 */
export class FileService {
  constructor(
    readonly repository: ProjectRepository = projectRepository,
    readonly directory = env.uploadDir,
  ) {}
  list(actor: Actor, projectId: number) {
    requirePermission(actor, "project:record:view")
    return this.repository.read(actor, (data) => {
      if (!data.projects.some((p) => p.id === projectId)) throw AppError.notFound()
      return data.files.filter((f) => f.projectId === projectId && !f.deletedAt).map(fileDto)
    })
  }
  async upload(actor: Actor, projectId: number, file: File) {
    if (!file.size || file.size > env.uploadMaxBytes)
      throw AppError.badRequest(
        `合同文件须大于0且不超过${Math.floor(env.uploadMaxBytes / 1024 / 1024)}MB`,
      )
    const name = basename(file.name.replaceAll("\\", "/"))
      .split("")
      .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
      .join("")
      .slice(0, 255)
    const bytes = new Uint8Array(await file.arrayBuffer())
    const contentType = contractFileType(name, bytes)
    const storageKey = crypto.randomUUID()
    const diskPath = resolve(this.directory, storageKey)
    let saved = false
    try {
      return await this.repository.write(actor, async (tx, data, current) => {
        manageProject(data, current, projectId, "project:record:update")
        if (!data.contracts.some((c) => c.projectId === projectId))
          throw AppError.conflict("请先保存合同资料再上传附件")
        await mkdir(resolve(this.directory), { recursive: true })
        await Bun.write(diskPath, bytes)
        saved = true
        const [result] = await tx.contractFiles.insert({
          projectId,
          name,
          size: bytes.length,
          storageKey,
          contentType,
          sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
          uploadedBy: current.user.id,
        })
        await businessAudit(
          tx,
          current.user.id,
          "upload-contract-file",
          "contract_file",
          result.insertId,
          null,
          { projectId, name, size: bytes.length },
        )
        return { id: result.insertId, name, size: bytes.length, contentType }
      })
    } catch (error) {
      if (saved) await unlink(diskPath).catch(() => {})
      throw error
    }
  }
  async download(actor: Actor, id: number) {
    const metadata = await this.repository.write(actor, async (tx, data, current) => {
      requirePermission(current, "project:record:view")
      const f = data.files.find((f) => f.id === id && !f.deletedAt)
      const p = data.projects.find((p) => p.id === f?.projectId && !p.deletedAt)
      if (!f || !p) throw AppError.notFound()
      assertBusinessAccess(
        fullProject(data, current, p) || visibleTeams(data, current, p.id).length > 0,
      )
      await businessAudit(
        tx,
        current.user.id,
        "download-contract-file",
        "contract_file",
        id,
        null,
        { projectId: p.id },
      )
      return f
    })
    const file = Bun.file(resolve(this.directory, metadata.storageKey))
    if (!(await file.exists())) throw AppError.notFound("合同文件缺失，请联系管理员")
    return new Response(file, {
      headers: {
        "content-type": metadata.contentType,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(metadata.name)}`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    })
  }
  remove(actor: Actor, id: number) {
    return this.repository.write(actor, async (tx, data, current) => {
      const f = data.files.find((f) => f.id === id && !f.deletedAt)
      if (!f) throw AppError.notFound()
      manageProject(data, current, f.projectId, "project:record:update")
      await tx.contractFiles.update(id, { deletedAt: new Date(), version: f.version + 1 })
      await businessAudit(
        tx,
        current.user.id,
        "remove-contract-file",
        "contract_file",
        id,
        { projectId: f.projectId, name: f.name },
        null,
      )
      return { id }
    })
  }
}
