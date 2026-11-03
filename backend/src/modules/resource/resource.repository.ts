import { and, asc, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/db"
import * as s from "@/db/schema"
import { loadState, type Database } from "@/modules/identity/identity.repository"
import { actorFrom } from "@/modules/identity/identity.service"
import type { Actor } from "@/utils/authorization"
import { AppError } from "@/utils/errors"
export type ResourceTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
export function resourceScope(actor: Actor) {
  if (actor.profile.dataScope === "ALL") return sql`true`
  if (actor.profile.dataScope === "SELF") return eq(s.resources.maintainerId, actor.user.id)
  return inArray(s.resources.ownerOrgId, actor.orgIds.length ? actor.orgIds : [0])
}
export function resourceWriter(tx: ResourceTransaction) {
  return {
    resources: {
      all() {
        return tx.select().from(s.resources).orderBy(asc(s.resources.id))
      },
      find(id: number) {
        return tx.select().from(s.resources).where(eq(s.resources.id, id))
      },
      async insert(values: typeof s.resources.$inferInsert) {
        try {
          const [r] = await tx.insert(s.resources).values(values)
          return r.insertId
        } catch (error) {
          if (duplicate(error)) throw AppError.conflict("资源标识或请求已存在，请核对后重试")
          throw error
        }
      },
      update(id: number, values: Partial<typeof s.resources.$inferInsert>) {
        return tx.update(s.resources).set(values).where(eq(s.resources.id, id))
      },
    },
    contacts: {
      all() {
        return tx.select().from(s.resourceContacts).orderBy(asc(s.resourceContacts.id))
      },
      find(id: number) {
        return tx.select().from(s.resourceContacts).where(eq(s.resourceContacts.id, id))
      },
      async insert(values: typeof s.resourceContacts.$inferInsert) {
        const [r] = await tx.insert(s.resourceContacts).values(values)
        return r.insertId
      },
      update(id: number, values: Partial<typeof s.resourceContacts.$inferInsert>) {
        return tx.update(s.resourceContacts).set(values).where(eq(s.resourceContacts.id, id))
      },
    },
    cooperations: {
      all() {
        return tx.select().from(s.resourceCooperations).orderBy(asc(s.resourceCooperations.id))
      },
      find(id: number) {
        return tx.select().from(s.resourceCooperations).where(eq(s.resourceCooperations.id, id))
      },
      async insert(values: typeof s.resourceCooperations.$inferInsert) {
        const [r] = await tx.insert(s.resourceCooperations).values(values)
        return r.insertId
      },
      update(id: number, values: Partial<typeof s.resourceCooperations.$inferInsert>) {
        return tx
          .update(s.resourceCooperations)
          .set(values)
          .where(eq(s.resourceCooperations.id, id))
      },
    },
    followups: {
      all() {
        return tx.select().from(s.resourceFollowups).orderBy(asc(s.resourceFollowups.id))
      },
      find(id: number) {
        return tx.select().from(s.resourceFollowups).where(eq(s.resourceFollowups.id, id))
      },
      async insert(values: typeof s.resourceFollowups.$inferInsert) {
        const [r] = await tx.insert(s.resourceFollowups).values(values)
        return r.insertId
      },
      update(id: number, values: Partial<typeof s.resourceFollowups.$inferInsert>) {
        return tx.update(s.resourceFollowups).set(values).where(eq(s.resourceFollowups.id, id))
      },
    },
    merges: {
      all() {
        return tx.select().from(s.resourceMergeRecords).orderBy(asc(s.resourceMergeRecords.id))
      },
      find(id: number) {
        return tx.select().from(s.resourceMergeRecords).where(eq(s.resourceMergeRecords.id, id))
      },
      async insert(values: typeof s.resourceMergeRecords.$inferInsert) {
        const [r] = await tx.insert(s.resourceMergeRecords).values(values)
        return r.insertId
      },
      update(id: number, values: Partial<typeof s.resourceMergeRecords.$inferInsert>) {
        return tx
          .update(s.resourceMergeRecords)
          .set(values)
          .where(eq(s.resourceMergeRecords.id, id))
      },
    },
    visible(actor: Actor) {
      return tx.select().from(s.resources).where(resourceScope(actor))
    },
    events(id: number) {
      return tx
        .select()
        .from(s.auditLogs)
        .where(and(eq(s.auditLogs.entityType, "resource"), eq(s.auditLogs.entityId, id)))
    },
    async contracts() {
      return tx.select().from(s.projectContracts)
    },
    async projects() {
      return tx.select().from(s.projects)
    },
    async teams() {
      return tx.select().from(s.projectTeams)
    },
    updateContract(id: number, values: Partial<typeof s.projectContracts.$inferInsert>) {
      return tx.update(s.projectContracts).set(values).where(eq(s.projectContracts.id, id))
    },
    updateProject(id: number, version: number) {
      return tx
        .update(s.projects)
        .set({ version: version + 1 })
        .where(and(eq(s.projects.id, id), eq(s.projects.version, version)))
    },
    audit(actorId: number, action: string, entityId: number, detail: unknown) {
      return tx
        .insert(s.auditLogs)
        .values({ actorId, action, entityType: "resource", entityId, afterData: detail })
    },
  }
}
export type ResourceConnection = ReturnType<typeof resourceWriter>
export class ResourceRepository {
  constructor(readonly database: Database = db) {}
  run<T>(
    actor: Actor,
    write: boolean,
    work: (
      tx: ResourceConnection,
      current: Actor,
      identity: Awaited<ReturnType<typeof loadState>>,
    ) => Promise<T>,
  ) {
    return this.database.transaction(async (tx) => {
      const identity = await loadState(tx, write)
      const user = identity.users.find((u) => u.id === actor.user.id)
      if (!user || user.status !== "ACTIVE" || user.authVersion !== actor.user.authVersion)
        throw AppError.tokenExpired()
      const current = actorFrom(identity, user)
      if (write) {
        await tx
          .select({ id: s.projects.id })
          .from(s.projects)
          .orderBy(asc(s.projects.id))
          .for("update")
        await tx
          .select({ id: s.resources.id })
          .from(s.resources)
          .orderBy(asc(s.resources.id))
          .for("update")
      }
      try {
        return await work(resourceWriter(tx), current, identity)
      } catch (error) {
        if (duplicate(error)) throw AppError.conflict("资源标识或请求已存在，请刷新后重试")
        throw error
      }
    })
  }
}
function duplicate(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (("code" in error && error.code === "ER_DUP_ENTRY") ||
      ("cause" in error && duplicate(error.cause)))
  )
}
export const resourceRepository = new ResourceRepository()
