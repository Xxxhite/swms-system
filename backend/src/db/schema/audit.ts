import { datetime, int, json, mysqlTable, varchar } from "drizzle-orm/mysql-core"
import { users } from "./identity"

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  actorId: int("actor_id", { unsigned: true }).references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: int("entity_id", { unsigned: true }),
  beforeData: json("before_data"),
  afterData: json("after_data"),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 })
    .notNull()
    .$defaultFn(() => new Date()),
})
