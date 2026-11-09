import { regionColumns } from "./region"
import {
  datetime,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core"
import { organizations, users } from "./identity"

const stamps = () => ({
  createdAt: datetime("created_at", { mode: "date", fsp: 3 })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
  version: int("version", { unsigned: true }).notNull().default(1),
})
export const resources = mysqlTable(
  "resources",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    normalizedName: varchar("normalized_name", { length: 150 }).notNull(),
    creditCode: varchar("credit_code", { length: 32 }),
    unitType: varchar("unit_type", { length: 50 }).notNull(),
    ...regionColumns(),
    region: varchar("region", { length: 100 }).notNull(),
    address: varchar("address", { length: 255 }).notNull().default(""),
    description: text("description"),
    source: varchar("source", { length: 100 }).notNull().default(""),
    capabilityCodes: json("capability_codes")
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
    serviceFieldCodes: json("service_field_codes")
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
    intention: varchar("intention", { length: 1000 }).notNull().default(""),
    ownerOrgId: int("owner_org_id", { unsigned: true })
      .notNull()
      .references(() => organizations.id),
    maintainerId: int("maintainer_id", { unsigned: true })
      .notNull()
      .references(() => users.id),
    status: mysqlEnum("status", ["ACTIVE", "ARCHIVED", "MERGED"]).notNull().default("ACTIVE"),
    mergedIntoId: int("merged_into_id", { unsigned: true }),
    createdBy: int("created_by", { unsigned: true })
      .notNull()
      .references(() => users.id),
    requestKey: varchar("request_key", { length: 64 }),
    ...stamps(),
  },
  (t) => [
    uniqueIndex("resource_credit_unique").on(t.creditCode),
    uniqueIndex("resource_request_unique").on(t.createdBy, t.requestKey),
    index("resource_scope").on(t.ownerOrgId, t.maintainerId),
  ],
)
export const resourceContacts = mysqlTable("resource_contacts", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  resourceId: int("resource_id", { unsigned: true })
    .notNull()
    .references(() => resources.id),
  name: varchar("name", { length: 100 }).notNull(),
  position: varchar("position", { length: 100 }).notNull().default(""),
  phone: varchar("phone", { length: 50 }).notNull().default(""),
  email: varchar("email", { length: 150 }).notNull().default(""),
  note: varchar("note", { length: 1000 }).notNull().default(""),
  isPrimary: int("is_primary").notNull().default(0),
  status: mysqlEnum("status", ["ACTIVE", "ARCHIVED"]).notNull().default("ACTIVE"),
  ...stamps(),
})
export const cooperationStatuses = [
  "TO_CONTACT",
  "CONTACTING",
  "NEGOTIATING",
  "TO_SIGN",
  "AGREED",
  "ENDED",
  "TERMINATED",
] as const
export const resourceCooperations = mysqlTable(
  "resource_cooperations",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    resourceId: int("resource_id", { unsigned: true })
      .notNull()
      .references(() => resources.id),
    title: varchar("title", { length: 150 }).notNull(),
    type: mysqlEnum("type", ["MANUAL", "CONTRACT"]).notNull().default("MANUAL"),
    projectId: int("project_id", { unsigned: true }),
    contractId: int("contract_id", { unsigned: true }),
    ownerId: int("owner_id", { unsigned: true })
      .notNull()
      .references(() => users.id),
    status: mysqlEnum("status", cooperationStatuses).notNull().default("TO_CONTACT"),
    startDate: varchar("start_date", { length: 10 }),
    endDate: varchar("end_date", { length: 10 }),
    wasEffective: int("was_effective").notNull().default(0),
    basis: varchar("basis", { length: 1000 }).notNull().default(""),
    result: varchar("result", { length: 2000 }).notNull().default(""),
    feedback: varchar("feedback", { length: 2000 }).notNull().default(""),
    feedbackRating: mysqlEnum("feedback_rating", ["SATISFIED", "GENERAL", "NEEDS_IMPROVEMENT"]),
    feedbackBy: int("feedback_by", { unsigned: true }).references(() => users.id),
    feedbackAt: datetime("feedback_at", { mode: "date", fsp: 3 }),
    ...stamps(),
  },
  (t) => [
    uniqueIndex("resource_contract_source").on(t.contractId),
    index("cooperation_resource").on(t.resourceId),
  ],
)
export const resourceFollowups = mysqlTable("resource_followups", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  resourceId: int("resource_id", { unsigned: true })
    .notNull()
    .references(() => resources.id),
  cooperationId: int("cooperation_id", { unsigned: true }).references(
    () => resourceCooperations.id,
  ),
  contactId: int("contact_id", { unsigned: true }).references(() => resourceContacts.id),
  occurredAt: datetime("occurred_at", { mode: "date", fsp: 3 }).notNull(),
  method: varchar("method", { length: 50 }).notNull(),
  content: varchar("content", { length: 2000 }).notNull(),
  result: varchar("result", { length: 2000 }).notNull().default(""),
  nextAction: varchar("next_action", { length: 1000 }).notNull().default(""),
  nextOwnerId: int("next_owner_id", { unsigned: true }).references(() => users.id),
  nextDueDate: varchar("next_due_date", { length: 10 }),
  completed: int("completed").notNull().default(0),
  createdBy: int("created_by", { unsigned: true })
    .notNull()
    .references(() => users.id),
  ...stamps(),
})
export const resourceMergeRecords = mysqlTable("resource_merge_records", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  sourceId: int("source_id", { unsigned: true })
    .notNull()
    .references(() => resources.id),
  targetId: int("target_id", { unsigned: true })
    .notNull()
    .references(() => resources.id),
  reason: varchar("reason", { length: 1000 }).notNull(),
  actorId: int("actor_id", { unsigned: true })
    .notNull()
    .references(() => users.id),
  summary: json("summary").$type<Record<string, number>>().notNull(),
  ...stamps(),
})
