import { asc } from "drizzle-orm"
import { db } from "@/db"
import { administrativeRegions } from "@/db/schema"
import type { Database } from "@/modules/identity/identity.repository"
export class RegionRepository {
  constructor(readonly database: Database = db) {}
  list() {
    return this.database
      .select()
      .from(administrativeRegions)
      .orderBy(asc(administrativeRegions.sortOrder), asc(administrativeRegions.code))
  }
}
