import { eq, sql } from "drizzle-orm"
import data from "@/db/data/regions.json"
import { administrativeRegions } from "@/db/schema"
import type { Database } from "@/modules/identity/identity.repository"
import { regionPath, type Region } from "./region.shared"
export const regionDataset: Region[] = data.map((r) => ({ ...r, kind: r.kind as Region["kind"] }))
for (const row of regionDataset) regionPath(regionDataset, row.code)
export async function seedRegions(database: Database, apply = true) {
  const existing = await database.select().from(administrativeRegions)
  const changes = regionDataset.filter(
    (r) => JSON.stringify(existing.find((x) => x.code === r.code)) !== JSON.stringify(r),
  )
  if (apply)
    await database.transaction(async (tx) => {
      for (const level of [1, 2, 3])
        for (const row of changes.filter((r) => r.level === level)) {
          if (existing.some((r) => r.code === row.code))
            await tx
              .update(administrativeRegions)
              .set(row)
              .where(eq(administrativeRegions.code, row.code))
          else await tx.insert(administrativeRegions).values(row)
        }
    })
  return {
    dataset: "swms-gd-zj-20261105-01",
    rows: regionDataset.length,
    changes: changes.length,
    applied: apply,
  }
}
export async function regionDatabaseName(database: Database) {
  const result = await database.execute(sql`SELECT DATABASE() AS name`)
  return (result[0] as unknown as Array<{ name: string }>)[0]?.name
}
