import * as s from "@/db/schema"
import type { Database } from "@/modules/identity/identity.repository"
import { managementPermissionEntries, managementRoleDefaults } from "./management-permissions"
/** 默认只预览差异；显式apply时追加授权，保留自定义权限。 */
export async function grantManagementPermissions(database: Database, apply = false) {
  return database.transaction(async (tx) => {
    const roles = await tx.select().from(s.roles),
      existing = await tx.select().from(s.rolePermissions)
    const changes: Array<{ role: string; permission: string }> = []
    const entries = managementPermissionEntries
    if (apply)
      for (const [code, name] of entries) {
        const parts = code.split(":")
        await tx
          .insert(s.permissions)
          .values({
            code,
            name,
            module: "management",
            resource: parts.length === 3 ? parts[1] : "module",
            action: parts.at(-1)!,
          })
          .onDuplicateKeyUpdate({ set: { name } })
      }
    for (const role of roles)
      for (const code of role.code === "admin"
        ? entries.map(([c]) => c)
        : (managementRoleDefaults[role.code] ?? [])) {
        if (existing.some((p) => p.roleId === role.id && p.permissionCode === code)) continue
        changes.push({ role: role.code, permission: code })
        if (apply)
          await tx.insert(s.rolePermissions).values({ roleId: role.id, permissionCode: code })
      }
    return { apply, changes }
  })
}
