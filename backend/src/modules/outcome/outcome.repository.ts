import { asc, eq } from "drizzle-orm"
import * as s from "@/db/schema"
import type { ResourceTransaction } from "@/modules/resource/resource.repository"

export function outcomeWriter(tx: ResourceTransaction) {
  return {
    rules: {
      async insert(value: typeof s.indicatorCalculationRules.$inferInsert) {
        const [r] = await tx.insert(s.indicatorCalculationRules).values(value)
        return r.insertId
      },
    },
    outcomes: {
      async insert(value: typeof s.taskOutcomes.$inferInsert) {
        const [r] = await tx.insert(s.taskOutcomes).values(value)
        return r.insertId
      },
      update(id: number, value: Partial<typeof s.taskOutcomes.$inferInsert>) {
        return tx.update(s.taskOutcomes).set(value).where(eq(s.taskOutcomes.id, id))
      },
    },
    snapshots: {
      async insert(value: typeof s.outcomeSnapshots.$inferInsert) {
        const [r] = await tx.insert(s.outcomeSnapshots).values(value)
        return r.insertId
      },
    },
    links: {
      async insert(value: typeof s.outcomeRecordLinks.$inferInsert) {
        const [r] = await tx.insert(s.outcomeRecordLinks).values(value)
        return r.insertId
      },
      update(id: number, value: Partial<typeof s.outcomeRecordLinks.$inferInsert>) {
        return tx.update(s.outcomeRecordLinks).set(value).where(eq(s.outcomeRecordLinks.id, id))
      },
    },
    reviews: {
      async insert(value: typeof s.outcomeReviews.$inferInsert) {
        const [r] = await tx.insert(s.outcomeReviews).values(value)
        return r.insertId
      },
    },
  }
}
export async function loadOutcomeState(tx: ResourceTransaction) {
  return {
    rules: await tx
      .select()
      .from(s.indicatorCalculationRules)
      .orderBy(asc(s.indicatorCalculationRules.id)),
    outcomes: await tx.select().from(s.taskOutcomes).orderBy(asc(s.taskOutcomes.id)),
    snapshots: await tx.select().from(s.outcomeSnapshots).orderBy(asc(s.outcomeSnapshots.id)),
    links: await tx.select().from(s.outcomeRecordLinks).orderBy(asc(s.outcomeRecordLinks.id)),
    reviews: await tx.select().from(s.outcomeReviews).orderBy(asc(s.outcomeReviews.id)),
  }
}
