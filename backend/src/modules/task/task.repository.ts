import { asc, eq } from "drizzle-orm"
import * as s from "@/db/schema"
import type { ResourceTransaction } from "@/modules/resource/resource.repository"

/** 与项目事务共用身份、项目锁；项目锁串行化安排与配置变更。 */
export function taskWriter(tx: ResourceTransaction) {
  return {
    plans: {
      async insert(values: typeof s.servicePlanVersions.$inferInsert) {
        const [r] = await tx.insert(s.servicePlanVersions).values(values)
        return r.insertId
      },
      update(id: number, values: Partial<typeof s.servicePlanVersions.$inferInsert>) {
        return tx.update(s.servicePlanVersions).set(values).where(eq(s.servicePlanVersions.id, id))
      },
    },
    periods: {
      async insert(values: typeof s.servicePlanPeriods.$inferInsert) {
        const [r] = await tx.insert(s.servicePlanPeriods).values(values)
        return r.insertId
      },
      update(id: number, values: Partial<typeof s.servicePlanPeriods.$inferInsert>) {
        return tx.update(s.servicePlanPeriods).set(values).where(eq(s.servicePlanPeriods.id, id))
      },
      clear(planId: number) {
        return tx.delete(s.servicePlanPeriods).where(eq(s.servicePlanPeriods.planId, planId))
      },
    },
    tasks: {
      async insert(values: typeof s.serviceTasks.$inferInsert) {
        const [r] = await tx.insert(s.serviceTasks).values(values)
        return r.insertId
      },
      update(id: number, values: Partial<typeof s.serviceTasks.$inferInsert>) {
        return tx.update(s.serviceTasks).set(values).where(eq(s.serviceTasks.id, id))
      },
    },
    staff: {
      async insert(values: typeof s.serviceTaskStaff.$inferInsert) {
        const [r] = await tx.insert(s.serviceTaskStaff).values(values)
        return r.insertId
      },
      update(id: number, values: Partial<typeof s.serviceTaskStaff.$inferInsert>) {
        return tx.update(s.serviceTaskStaff).set(values).where(eq(s.serviceTaskStaff.id, id))
      },
      clear(taskId: number) {
        return tx.delete(s.serviceTaskStaff).where(eq(s.serviceTaskStaff.taskId, taskId))
      },
    },
    indicators: {
      async insert(values: typeof s.serviceTaskIndicators.$inferInsert) {
        const [r] = await tx.insert(s.serviceTaskIndicators).values(values)
        return r.insertId
      },
      update(id: number, values: Partial<typeof s.serviceTaskIndicators.$inferInsert>) {
        return tx
          .update(s.serviceTaskIndicators)
          .set(values)
          .where(eq(s.serviceTaskIndicators.id, id))
      },
      clear(taskId: number) {
        return tx.delete(s.serviceTaskIndicators).where(eq(s.serviceTaskIndicators.taskId, taskId))
      },
    },
    resources: {
      async insert(values: typeof s.serviceTaskResources.$inferInsert) {
        const [r] = await tx.insert(s.serviceTaskResources).values(values)
        return r.insertId
      },
      update(id: number, values: Partial<typeof s.serviceTaskResources.$inferInsert>) {
        return tx
          .update(s.serviceTaskResources)
          .set(values)
          .where(eq(s.serviceTaskResources.id, id))
      },
      clear(taskId: number) {
        return tx.delete(s.serviceTaskResources).where(eq(s.serviceTaskResources.taskId, taskId))
      },
    },
    events: {
      async insert(values: typeof s.serviceTaskEvents.$inferInsert) {
        const [r] = await tx.insert(s.serviceTaskEvents).values(values)
        return r.insertId
      },
      update(id: number, values: Partial<typeof s.serviceTaskEvents.$inferInsert>) {
        return tx.update(s.serviceTaskEvents).set(values).where(eq(s.serviceTaskEvents.id, id))
      },
    },
  }
}
export async function loadTaskState(tx: ResourceTransaction) {
  return {
    plans: await tx.select().from(s.servicePlanVersions).orderBy(asc(s.servicePlanVersions.id)),
    periods: await tx.select().from(s.servicePlanPeriods).orderBy(asc(s.servicePlanPeriods.id)),
    tasks: await tx.select().from(s.serviceTasks).orderBy(asc(s.serviceTasks.id)),
    staff: await tx.select().from(s.serviceTaskStaff).orderBy(asc(s.serviceTaskStaff.id)),
    indicators: await tx
      .select()
      .from(s.serviceTaskIndicators)
      .orderBy(asc(s.serviceTaskIndicators.id)),
    resources: await tx
      .select()
      .from(s.serviceTaskResources)
      .orderBy(asc(s.serviceTaskResources.id)),
    events: await tx.select().from(s.serviceTaskEvents).orderBy(asc(s.serviceTaskEvents.id)),
    units: await tx.select().from(s.resources).orderBy(asc(s.resources.id)),
    contacts: await tx.select().from(s.resourceContacts).orderBy(asc(s.resourceContacts.id)),
  }
}
