import * as s from "@/db/schema"
import type { Database } from "@/modules/identity/identity.repository"
import { taskPermissionEntries, taskRoleDefaults } from "./task-permissions"
/** 既有账号默认仅预览，显式apply追加差异。 */
export async function grantTaskPermissions(database: Database, apply = false) {
  return database.transaction(async (tx) => {
    const roles = await tx.select().from(s.roles),
      existing = await tx.select().from(s.rolePermissions)
    const entries = [["activity:view", "查看服务任务"], ...taskPermissionEntries]
    const changes: Array<{ role: string; permission: string }> = []
    if (apply)
      for (const [code, name] of entries) {
        const parts = code!.split(":")
        await tx
          .insert(s.permissions)
          .values({
            code: code!,
            name: name!,
            module: parts[0]!,
            resource: parts.length === 3 ? parts[1] : "module",
            action: parts.at(-1)!,
          })
          .onDuplicateKeyUpdate({ set: { name: name! } })
      }
    for (const role of roles)
      for (const code of role.code === "admin"
        ? entries.map(([code]) => code!)
        : (taskRoleDefaults[role.code] ?? [])) {
        if (existing.some((p) => p.roleId === role.id && p.permissionCode === code)) continue
        changes.push({ role: role.code, permission: code })
        if (apply)
          await tx.insert(s.rolePermissions).values({ roleId: role.id, permissionCode: code })
      }
    return { apply, changes }
  })
}
