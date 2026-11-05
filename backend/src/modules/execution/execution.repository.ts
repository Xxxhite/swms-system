import { asc, eq } from "drizzle-orm"
import * as s from "@/db/schema"
import type { ResourceTransaction } from "@/modules/resource/resource.repository"
/** 数据库访问仅由仓储执行，与既有身份和项目事务共用连接。 */
export function executionWriter(tx: ResourceTransaction) {
  return {
    refreshSessions() {
      return tx.select().from(s.executionSessions)
    },
    policies: {
      async insert(values: typeof s.executionPolicies.$inferInsert) {
        const [r] = await tx.insert(s.executionPolicies).values(values)
        return r.insertId
      },
      update(id: number, values: Partial<typeof s.executionPolicies.$inferInsert>) {
        return tx.update(s.executionPolicies).set(values).where(eq(s.executionPolicies.id, id))
      },
    },
    sessions: {
      async insert(values: typeof s.executionSessions.$inferInsert) {
        const [r] = await tx.insert(s.executionSessions).values(values)
        return r.insertId
      },
      update(id: number, values: Partial<typeof s.executionSessions.$inferInsert>) {
        return tx.update(s.executionSessions).set(values).where(eq(s.executionSessions.id, id))
      },
    },
    participants: {
      async insert(values: typeof s.serviceParticipants.$inferInsert) {
        const [r] = await tx.insert(s.serviceParticipants).values(values)
        return r.insertId
      },
      update(id: number, values: Partial<typeof s.serviceParticipants.$inferInsert>) {
        return tx.update(s.serviceParticipants).set(values).where(eq(s.serviceParticipants.id, id))
      },
    },
    rosters: {
      async insert(values: typeof s.executionRosters.$inferInsert) {
        const [r] = await tx.insert(s.executionRosters).values(values)
        return r.insertId
      },
      update(id: number, values: Partial<typeof s.executionRosters.$inferInsert>) {
        return tx.update(s.executionRosters).set(values).where(eq(s.executionRosters.id, id))
      },
    },
    credentials: {
      async insert(values: typeof s.executionCredentials.$inferInsert) {
        const [r] = await tx.insert(s.executionCredentials).values(values)
        return r.insertId
      },
      update(id: number, values: Partial<typeof s.executionCredentials.$inferInsert>) {
        return tx
          .update(s.executionCredentials)
          .set(values)
          .where(eq(s.executionCredentials.id, id))
      },
    },
    staffEvents: {
      async insert(values: typeof s.staffExecutionEvents.$inferInsert) {
        const [r] = await tx.insert(s.staffExecutionEvents).values(values)
        return r.insertId
      },
    },
    participationEvents: {
      async insert(values: typeof s.participationEvents.$inferInsert) {
        const [r] = await tx.insert(s.participationEvents).values(values)
        return r.insertId
      },
    },
    participations: {
      async insert(values: typeof s.executionParticipations.$inferInsert) {
        const [r] = await tx.insert(s.executionParticipations).values(values)
        return r.insertId
      },
      update(id: number, values: Partial<typeof s.executionParticipations.$inferInsert>) {
        return tx
          .update(s.executionParticipations)
          .set(values)
          .where(eq(s.executionParticipations.id, id))
      },
    },
    evidence: {
      async insert(values: typeof s.executionEvidence.$inferInsert) {
        const [r] = await tx.insert(s.executionEvidence).values(values)
        return r.insertId
      },
      update(id: number, values: Partial<typeof s.executionEvidence.$inferInsert>) {
        return tx.update(s.executionEvidence).set(values).where(eq(s.executionEvidence.id, id))
      },
    },
    exceptions: {
      async insert(values: typeof s.executionExceptions.$inferInsert) {
        const [r] = await tx.insert(s.executionExceptions).values(values)
        return r.insertId
      },
      update(id: number, values: Partial<typeof s.executionExceptions.$inferInsert>) {
        return tx.update(s.executionExceptions).set(values).where(eq(s.executionExceptions.id, id))
      },
    },
  }
}
export async function loadExecutionState(tx: ResourceTransaction) {
  return {
    policies: await tx.select().from(s.executionPolicies).orderBy(asc(s.executionPolicies.id)),
    sessions: await tx.select().from(s.executionSessions).orderBy(asc(s.executionSessions.id)),
    participants: await tx
      .select()
      .from(s.serviceParticipants)
      .orderBy(asc(s.serviceParticipants.id)),
    rosters: await tx.select().from(s.executionRosters).orderBy(asc(s.executionRosters.id)),
    credentials: await tx
      .select()
      .from(s.executionCredentials)
      .orderBy(asc(s.executionCredentials.id)),
    staffEvents: await tx
      .select()
      .from(s.staffExecutionEvents)
      .orderBy(asc(s.staffExecutionEvents.id)),
    participationEvents: await tx
      .select()
      .from(s.participationEvents)
      .orderBy(asc(s.participationEvents.id)),
    participations: await tx
      .select()
      .from(s.executionParticipations)
      .orderBy(asc(s.executionParticipations.id)),
    evidence: await tx.select().from(s.executionEvidence).orderBy(asc(s.executionEvidence.id)),
    exceptions: await tx
      .select()
      .from(s.executionExceptions)
      .orderBy(asc(s.executionExceptions.id)),
  }
}
