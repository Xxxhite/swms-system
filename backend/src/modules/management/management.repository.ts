import { eq, asc } from "drizzle-orm"
import { db } from "@/db"
import * as s from "@/db/schema"
import { loadBusinessState, type BusinessState } from "@/modules/project/project.repository"
import type { Database } from "@/modules/identity/identity.repository"
import { actorFrom } from "@/modules/identity/identity.service"
import { AppError } from "@/utils/errors"
import type { Actor } from "@/utils/authorization"
export type ManagementRow = typeof s.managementFollowups.$inferSelect
export type ManagementState = BusinessState & {
  management: ManagementRow[]
  managementEvents: (typeof s.managementFollowupEvents.$inferSelect)[]
  cooperations: (typeof s.resourceCooperations.$inferSelect)[]
  resourceFollowups: (typeof s.resourceFollowups.$inferSelect)[]
}
export class ManagementRepository {
  constructor(readonly database: Database = db) {}
  run<T>(
    actor: Actor,
    write: boolean,
    work: (data: ManagementState, writer: ReturnType<typeof managementWriter>) => Promise<T> | T,
  ): Promise<T> {
    return this.database.transaction(async (tx) => {
      const data = await loadBusinessState(tx, undefined, write)
      const user = data.identity.users.find((u) => u.id === actor.user.id)
      if (!user || user.status !== "ACTIVE" || user.authVersion !== actor.user.authVersion)
        throw AppError.tokenExpired()
      const current = actorFrom(data.identity, user)
      if (actor.profile.permissions.some((p) => !current.profile.permissions.includes(p)))
        throw AppError.forbidden("权限已变化，请刷新后重试")
      const query = tx.select().from(s.managementFollowups).orderBy(asc(s.managementFollowups.id))
      const management = await (write ? query.for("update") : query)
      return work(
        {
          ...data,
          actor: current,
          management,
          managementEvents: await tx.select().from(s.managementFollowupEvents),
          cooperations: await tx.select().from(s.resourceCooperations),
          resourceFollowups: await tx.select().from(s.resourceFollowups),
        },
        managementWriter(tx),
      )
    })
  }
}
type Connection = Parameters<Parameters<Database["transaction"]>[0]>[0]
function managementWriter(tx: Connection) {
  return {
    async insert(values: typeof s.managementFollowups.$inferInsert) {
      const [r] = await tx.insert(s.managementFollowups).values(values)
      return r.insertId
    },
    update(id: number, values: Partial<typeof s.managementFollowups.$inferInsert>) {
      return tx.update(s.managementFollowups).set(values).where(eq(s.managementFollowups.id, id))
    },
    event(values: typeof s.managementFollowupEvents.$inferInsert) {
      return tx.insert(s.managementFollowupEvents).values(values)
    },
    audit: (actorId: number, action: string, id: number, before: unknown, after: unknown) =>
      tx.insert(s.auditLogs).values({
        actorId,
        action,
        entityType: "management_followup",
        entityId: id,
        beforeData: before,
        afterData: after,
      }),
  }
}
export type ManagementWriter = ReturnType<typeof managementWriter>
export const managementRepository = new ManagementRepository()
