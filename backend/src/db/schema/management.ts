import {
  mysqlTable,
  foreignKey,
  int,
  varchar,
  date,
  datetime,
  json,
  mysqlEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core"
import { users, organizations } from "./identity"
import { projects, businessTimestamps } from "./project"
export const managementFollowups = mysqlTable(
  "management_followups",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    projectId: int("project_id", { unsigned: true })
      .notNull()
      .references(() => projects.id),
    teamId: int("team_id", { unsigned: true }).references(() => organizations.id),
    title: varchar("title", { length: 150 }).notNull(),
    description: varchar("description", { length: 2000 }).notNull(),
    sourceType: mysqlEnum("source_type", [
      "PROJECT",
      "INDICATOR",
      "PLAN",
      "TASK",
      "RECORD",
    ]).notNull(),
    sourceId: int("source_id", { unsigned: true }).notNull(),
    ownerId: int("owner_id", { unsigned: true })
      .notNull()
      .references(() => users.id),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    status: mysqlEnum("status", ["OPEN", "IN_PROGRESS", "COMPLETED"]).notNull().default("OPEN"),
    result: varchar("result", { length: 2000 }).notNull().default(""),
    completedBy: int("completed_by", { unsigned: true }).references(() => users.id),
    completedAt: datetime("completed_at", { mode: "date", fsp: 3 }),
    createdBy: int("created_by", { unsigned: true })
      .notNull()
      .references(() => users.id),
    requestKey: varchar("request_key", { length: 64 }).notNull(),
    requestFingerprint: varchar("request_fingerprint", { length: 64 }).notNull(),
    ...businessTimestamps(),
  },
  (t) => [
    uniqueIndex("management_creation_key").on(t.createdBy, t.requestKey),
    index("management_scope_due").on(t.projectId, t.teamId, t.ownerId, t.status, t.dueDate),
  ],
)
export const managementFollowupEvents = mysqlTable(
  "management_followup_events",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    followupId: int("followup_id", { unsigned: true }).notNull(),
    actorId: int("actor_id", { unsigned: true })
      .notNull()
      .references(() => users.id),
    action: varchar("action", { length: 32 }).notNull(),
    note: varchar("note", { length: 2000 }).notNull(),
    beforeData: json("before_data").$type<Record<string, unknown>>(),
    afterData: json("after_data").$type<Record<string, unknown>>(),
    requestKey: varchar("request_key", { length: 64 }).notNull(),
    requestFingerprint: varchar("request_fingerprint", { length: 64 }).notNull(),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("management_event_key").on(t.followupId, t.requestKey),
    foreignKey({
      name: "management_event_followup_fk",
      columns: [t.followupId],
      foreignColumns: [managementFollowups.id],
    }),
  ],
)
