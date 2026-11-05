import {
  date,
  datetime,
  foreignKey,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core"
import { users } from "./identity"
import { projectIndicators, monthlyReports } from "./indicator"
import { serviceTasks } from "./task"
import { approvalTasks } from "./approval"
import { businessTimestamps } from "./project"

export type CalculationMode = "MANUAL" | "SCENES" | "VISITS" | "PEOPLE" | "STAFF_HOURS"
export interface OutcomeInterval {
  userId: number
  startAt: string
  endAt: string
}
export interface OutcomeIssue {
  key: string
  label: string
  target: "STAFF" | "PARTICIPATION" | "SESSION"
  targetId: number
  reason: string
  notes: Array<{ reason: string; createdAt: string; evidenceIds: number[] }>
}
export interface OutcomeSource {
  address?: string
  regionPathSnapshot?: Array<{ code: string; name: string }> | null
  taskId: number
  taskVersion: number
  sourceVersion: number
  projectId: number
  teamId: number
  title: string
  date: string
  form: string
  state: "ENDED" | "STOPPED"
  leaderId: number
  startedAt: string
  endedAt: string
  summary: string
  staff: Array<{
    id: number
    name: string
    inId: number | null
    outId: number | null
    startAt: string | null
    endAt: string | null
    flags: string[]
    location: string
  }>
  participants: Array<{
    id: number
    name: string
    rosterId: number
    eventId: number
    occurredAt: string
    method: string
    status: string
    flags: string[]
  }>
  evidence: Array<{ id: number; name: string; sha256: string; size: number; contentType: string }>
  issues: OutcomeIssue[]
  rules: Array<{
    indicatorId: number
    indicatorName: string
    unit: string
    mode: CalculationMode
    ruleId: number | null
    ruleVersion: number
    manualValue: string
    plannedValue: string
  }>
}
export interface OutcomeDecision {
  key: string
  decision: "ACCEPT" | "EXCLUDE"
  reason: string
}
export interface OutcomeMeasure {
  mode: CalculationMode
  value: string
  people: number[]
  intervals: OutcomeInterval[]
}

export const indicatorCalculationRules = mysqlTable(
  "indicator_calculation_rules",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    indicatorId: int("indicator_id", { unsigned: true }).notNull(),
    mode: mysqlEnum("mode", ["MANUAL", "SCENES", "VISITS", "PEOPLE", "STAFF_HOURS"]).notNull(),
    effectiveDate: date("effective_date", { mode: "string" }).notNull(),
    revision: int("revision", { unsigned: true }).notNull(),
    reason: varchar("reason", { length: 1000 }).notNull(),
    createdBy: int("created_by", { unsigned: true })
      .notNull()
      .references(() => users.id),
    ...businessTimestamps(),
  },
  (t) => [
    uniqueIndex("calculation_rule_revision").on(t.indicatorId, t.revision),
    foreignKey({
      name: "calc_rule_indicator_fk",
      columns: [t.indicatorId],
      foreignColumns: [projectIndicators.id],
    }),
  ],
)

export const taskOutcomes = mysqlTable("task_outcomes", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  taskId: int("task_id", { unsigned: true })
    .notNull()
    .unique()
    .references(() => serviceTasks.id),
  summary: varchar("summary", { length: 4000 }).notNull().default(""),
  draftSnapshotId: int("draft_snapshot_id", { unsigned: true }),
  summaryStatus: mysqlEnum("summary_status", ["DRAFT", "IN_REVIEW", "REJECTED", "SUBMITTED"])
    .notNull()
    .default("DRAFT"),
  effectiveSummarySnapshotId: int("effective_summary_snapshot_id", { unsigned: true }),
  createdBy: int("created_by", { unsigned: true })
    .notNull()
    .references(() => users.id),
  ...businessTimestamps(),
})
export const outcomeSnapshots = mysqlTable("outcome_snapshots", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  outcomeId: int("outcome_id", { unsigned: true })
    .notNull()
    .references(() => taskOutcomes.id),
  sourceVersion: int("source_version", { unsigned: true }).notNull(),
  fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  data: json("data").$type<OutcomeSource>().notNull(),
  createdBy: int("created_by", { unsigned: true })
    .notNull()
    .references(() => users.id),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 })
    .notNull()
    .$defaultFn(() => new Date()),
})
export const outcomeRecordLinks = mysqlTable(
  "outcome_record_links",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    outcomeId: int("outcome_id", { unsigned: true })
      .notNull()
      .references(() => taskOutcomes.id),
    taskId: int("task_id", { unsigned: true })
      .notNull()
      .references(() => serviceTasks.id),
    indicatorId: int("indicator_id", { unsigned: true })
      .notNull()
      .references(() => projectIndicators.id),
    recordId: int("record_id", { unsigned: true })
      .notNull()
      .unique()
      .references(() => monthlyReports.id),
    draftSnapshotId: int("draft_snapshot_id", { unsigned: true }).references(
      () => outcomeSnapshots.id,
    ),
    effectiveReviewId: int("effective_review_id", { unsigned: true }),
    ...businessTimestamps(),
  },
  (t) => [uniqueIndex("outcome_task_indicator").on(t.taskId, t.indicatorId)],
)
export const outcomeReviews = mysqlTable("outcome_reviews", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  approvalTaskId: int("approval_task_id", { unsigned: true })
    .notNull()
    .unique()
    .references(() => approvalTasks.id),
  snapshotId: int("snapshot_id", { unsigned: true })
    .notNull()
    .references(() => outcomeSnapshots.id),
  recordLinkId: int("record_link_id", { unsigned: true }).references(() => outcomeRecordLinks.id),
  reviewerId: int("reviewer_id", { unsigned: true })
    .notNull()
    .references(() => users.id),
  decisions: json("decisions").$type<OutcomeDecision[]>().notNull(),
  declaredValue: varchar("declared_value", { length: 40 }).notNull(),
  measure: json("measure").$type<OutcomeMeasure>().notNull(),
  reason: varchar("reason", { length: 1000 }).notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 })
    .notNull()
    .$defaultFn(() => new Date()),
})
