import {
  date,
  datetime,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core"
import { users, organizations } from "./identity"
import { projects, projectServicePoints, businessTimestamps } from "./project"
import { projectIndicators, teamIndicatorTargets } from "./indicator"
import { resources, resourceContacts } from "./resource"

export const servicePlanVersions = mysqlTable(
  "service_plan_versions",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    projectId: int("project_id", { unsigned: true })
      .notNull()
      .references(() => projects.id),
    targetId: int("target_id", { unsigned: true })
      .notNull()
      .references(() => teamIndicatorTargets.id),
    revision: int("revision", { unsigned: true }).notNull(),
    mode: mysqlEnum("mode", ["MONTHLY", "MILESTONE"]).notNull(),
    status: mysqlEnum("status", ["DRAFT", "PUBLISHED"]).notNull().default("DRAFT"),
    effectiveDate: date("effective_date", { mode: "string" }).notNull(),
    targetValue: decimal("target_value", { precision: 12, scale: 2 }).notNull(),
    targetVersion: int("target_version", { unsigned: true }).notNull(),
    indicatorVersion: int("indicator_version", { unsigned: true }).notNull(),
    reason: varchar("reason", { length: 1000 }).notNull(),
    createdBy: int("created_by", { unsigned: true })
      .notNull()
      .references(() => users.id),
    publishedBy: int("published_by", { unsigned: true }).references(() => users.id),
    publishedAt: datetime("published_at", { mode: "date", fsp: 3 }),
    ...businessTimestamps(),
  },
  (t) => [uniqueIndex("plan_target_revision").on(t.targetId, t.revision)],
)

export const servicePlanPeriods = mysqlTable(
  "service_plan_periods",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    planId: int("plan_id", { unsigned: true })
      .notNull()
      .references(() => servicePlanVersions.id),
    sequence: int("sequence", { unsigned: true }).notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    targetValue: decimal("target_value", { precision: 12, scale: 2 }).notNull(),
  },
  (t) => [uniqueIndex("plan_period_sequence").on(t.planId, t.sequence)],
)

export const serviceTasks = mysqlTable(
  "service_tasks",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    projectId: int("project_id", { unsigned: true })
      .notNull()
      .references(() => projects.id),
    teamId: int("team_id", { unsigned: true })
      .notNull()
      .references(() => organizations.id),
    title: varchar("title", { length: 150 }).notNull(),
    form: mysqlEnum("form", ["COLLECTIVE", "HOME_VISIT", "STATIONED"]).notNull(),
    kind: mysqlEnum("kind", ["INDICATOR", "OTHER"]).notNull(),
    pointId: int("point_id", { unsigned: true }).references(() => projectServicePoints.id),
    location: varchar("location", { length: 150 }).notNull(),
    address: varchar("address", { length: 255 }).notNull(),
    startAt: datetime("start_at", { mode: "date", fsp: 3 }).notNull(),
    endAt: datetime("end_at", { mode: "date", fsp: 3 }).notNull(),
    leaderId: int("leader_id", { unsigned: true })
      .notNull()
      .references(() => users.id),
    expectedPeople: int("expected_people", { unsigned: true }).notNull(),
    description: text("description").notNull(),
    evidence: varchar("evidence", { length: 1000 }).notNull(),
    status: mysqlEnum("status", ["SCHEDULED", "CANCELED"]).notNull().default("SCHEDULED"),
    sourceTaskId: int("source_task_id", { unsigned: true }),
    createdBy: int("created_by", { unsigned: true })
      .notNull()
      .references(() => users.id),
    requestKey: varchar("request_key", { length: 64 }).notNull(),
    batchIndex: int("batch_index", { unsigned: true }).notNull(),
    batchFingerprint: varchar("batch_fingerprint", { length: 64 }).notNull(),
    ...businessTimestamps(),
  },
  (t) => [
    uniqueIndex("task_request_instance").on(t.createdBy, t.requestKey, t.batchIndex),
    index("task_schedule").on(t.projectId, t.teamId, t.startAt),
  ],
)

export const serviceTaskStaff = mysqlTable(
  "service_task_staff",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    taskId: int("task_id", { unsigned: true })
      .notNull()
      .references(() => serviceTasks.id),
    userId: int("user_id", { unsigned: true })
      .notNull()
      .references(() => users.id),
  },
  (t) => [
    uniqueIndex("task_staff_unique").on(t.taskId, t.userId),
    index("task_staff_user").on(t.userId),
  ],
)

export const serviceTaskIndicators = mysqlTable(
  "service_task_indicators",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    taskId: int("task_id", { unsigned: true })
      .notNull()
      .references(() => serviceTasks.id),
    indicatorId: int("indicator_id", { unsigned: true })
      .notNull()
      .references(() => projectIndicators.id),
    targetId: int("target_id", { unsigned: true })
      .notNull()
      .references(() => teamIndicatorTargets.id),
    plannedValue: decimal("planned_value", { precision: 12, scale: 2 }).notNull(),
    planId: int("plan_id", { unsigned: true })
      .notNull()
      .references(() => servicePlanVersions.id),
    periodId: int("period_id", { unsigned: true })
      .notNull()
      .references(() => servicePlanPeriods.id),
  },
  (t) => [uniqueIndex("task_indicator_unique").on(t.taskId, t.indicatorId)],
)

export const serviceTaskResources = mysqlTable(
  "service_task_resources",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    taskId: int("task_id", { unsigned: true })
      .notNull()
      .references(() => serviceTasks.id),
    resourceId: int("resource_id", { unsigned: true })
      .notNull()
      .references(() => resources.id),
    contactId: int("contact_id", { unsigned: true }).references(() => resourceContacts.id),
    resourceName: varchar("resource_name", { length: 150 }).notNull(),
    collaboration: varchar("collaboration", { length: 1000 }).notNull(),
  },
  (t) => [uniqueIndex("task_resource_unique").on(t.taskId, t.resourceId)],
)

export const serviceTaskEvents = mysqlTable("service_task_events", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  taskId: int("task_id", { unsigned: true })
    .notNull()
    .references(() => serviceTasks.id),
  actorId: int("actor_id", { unsigned: true })
    .notNull()
    .references(() => users.id),
  action: varchar("action", { length: 50 }).notNull(),
  reason: varchar("reason", { length: 1000 }).notNull(),
  beforeData: json("before_data").$type<unknown>(),
  afterData: json("after_data").$type<unknown>(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 })
    .notNull()
    .$defaultFn(() => new Date()),
})
