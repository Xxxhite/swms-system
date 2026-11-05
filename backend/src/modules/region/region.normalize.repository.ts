import { asc, and, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import * as s from "@/db/schema"
import { loadState, type Database } from "@/modules/identity/identity.repository"
import { actorFrom } from "@/modules/identity/identity.service"
import { AppError } from "@/utils/errors"
import { regionPath, type Region } from "./region.shared"
export function suggestRegion(regions: Region[], text: string) {
  const exact = regions.filter(
    (r) =>
      r.enabled &&
      (r.name === text.trim() || (r.level === 2 && r.name.replace(/市$/, "") === text.trim())),
  )
  if (exact.length === 1) return exact[0]!.code
  const matches = regions.filter((r) => r.enabled && r.level === 3 && text.includes(r.name))
  return matches.length === 1 ? matches[0]!.code : null
}
export class RegionNormalizationRepository {
  constructor(readonly database: Database = db) {}
  run(apply = false, username = "admin") {
    return this.database.transaction(async (tx) => {
      const identity = await loadState(tx, apply),
        user = identity.users.find((u) => u.username === username)
      if (
        !user ||
        user.status !== "ACTIVE" ||
        !actorFrom(identity, user).profile.roles.includes("admin")
      )
        throw AppError.forbidden("规范化需指定启用的管理员")
      if (apply)
        await tx
          .select({ id: s.projects.id })
          .from(s.projects)
          .orderBy(asc(s.projects.id))
          .for("update")
      const regions = await tx.select().from(s.administrativeRegions)
      const contracts = await tx.select().from(s.projectContracts),
        points = await tx.select().from(s.projectServicePoints),
        resources = await tx.select().from(s.resources),
        tasks = await tx.select().from(s.serviceTasks),
        sessions = await tx.select().from(s.executionSessions)
      const collections = [
        {
          kind: "contract",
          table: s.projectContracts,
          rows: contracts.map((r) => ({ ...r, text: r.serviceArea })),
        },
        {
          kind: "point",
          table: s.projectServicePoints,
          rows: points.filter((r) => !r.deletedAt).map((r) => ({ ...r, text: r.address ?? "" })),
        },
        {
          kind: "resource",
          table: s.resources,
          rows: resources
            .filter((r) => r.status !== "MERGED")
            .map((r) => ({ ...r, text: r.region })),
        },
        {
          kind: "task",
          table: s.serviceTasks,
          rows: tasks
            .filter((r) => !sessions.some((x) => x.taskId === r.id))
            .map((r) => ({ ...r, text: r.address })),
        },
      ]
      const changes: Array<{
          kind: string
          id: number
          projectId: number | null
          code: string
          path: Array<{ code: string; name: string }>
          version: number
        }> = [],
        unresolved: Array<{ kind: string; id: number; original: string }> = [],
        projects = new Set<number>()
      for (const collection of collections)
        for (const row of collection.rows) {
          if (row.regionCode && row.regionPathSnapshot?.length) continue
          const code = row.regionCode ?? suggestRegion(regions, row.text)
          if (!code) {
            unresolved.push({ kind: collection.kind, id: row.id, original: row.text })
            continue
          }
          const path = regionPath(regions, code).map(({ code, name }) => ({ code, name })),
            projectId = "projectId" in row ? row.projectId : null
          changes.push({
            kind: collection.kind,
            id: row.id,
            projectId,
            code,
            path,
            version: row.version,
          })
          if (apply) {
            const [result] = await tx
              .update(collection.table)
              .set({ regionCode: code, regionPathSnapshot: path, version: row.version + 1 })
              .where(
                and(eq(collection.table.id, row.id), eq(collection.table.version, row.version)),
              )
            if (result.affectedRows !== 1) throw AppError.conflict("地址记录已变化，请重新预览")
            if (projectId) projects.add(projectId)
            await tx.insert(s.auditLogs).values({
              actorId: user.id,
              action: "normalize-region-address",
              entityType:
                collection.kind === "resource"
                  ? "resource"
                  : collection.kind === "task"
                    ? "service-task"
                    : "project",
              entityId:
                collection.kind === "resource" || collection.kind === "task"
                  ? row.id
                  : (projectId ?? row.id),
              beforeData: { kind: collection.kind, id: row.id, original: row.text },
              afterData: { regionCode: code, regionPathSnapshot: path, source: "地区规范化命令" },
            })
          }
        }
      if (apply)
        for (const id of projects)
          await tx
            .update(s.projects)
            .set({ version: sql`${s.projects.version}+1` })
            .where(eq(s.projects.id, id))
      return { applied: apply, changes, unresolved }
    })
  }
}
