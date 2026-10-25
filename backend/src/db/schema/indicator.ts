import {
  char,
  date,
  datetime,
  decimal,
  foreignKey,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core"
import { organizations, users } from "./identity"
import { projects, businessTimestamps } from "./project"
/** 项目指标表：同名指标依项目及统计口径独立管理。 */
export const projectIndicators = mysqlTable(
  "contract_indicators",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    projectId: int("project_id", { unsigned: true })
      .notNull()
      .references(() => projects.id),
    name: varchar("name", { length: 150 }).notNull(),
    unit: varchar("unit", { length: 20 }).notNull(),
    definition: text("definition").notNull(),
    targetValue: decimal("target_value", { precision: 12, scale: 2 }).notNull(),
    status: mysqlEnum("status", ["DRAFT", "ACTIVE"]).notNull().default("DRAFT"),
    deletedAt: datetime("deleted_at", { mode: "date", fsp: 3 }),
    ...businessTimestamps(),
  },
  (t) => [index("indicator_project").on(t.projectId)],
)
/** 团队指标目标表：指标启用前核对团队目标之和，已有月报的分配保留。 */
export const teamIndicatorTargets = mysqlTable(
  "contract_targets",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    indicatorId: int("indicator_id", { unsigned: true })
      .notNull()
      .references(() => projectIndicators.id),
    teamId: int("team_id", { unsigned: true })
      .notNull()
      .references(() => organizations.id),
    targetValue: decimal("target_value", { precision: 12, scale: 2 }).notNull(),
    ...businessTimestamps(),
  },
  (t) => [uniqueIndex("indicator_team_unique").on(t.indicatorId, t.teamId)],
)
/** 按次服务档案：同日同指标可多次记录，仅审批生效的完成量参与累计；旧月报保留原月份。 */
export const monthlyReports = mysqlTable(
  "service_records",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    indicatorId: int("indicator_id", { unsigned: true }).notNull(),
    teamId: int("team_id", { unsigned: true }).notNull(),
    serviceDate: date("service_date", { mode: "string" }),
    requestKey: varchar("request_key", { length: 64 }),
    legacyReportId: int("legacy_report_id", { unsigned: true }).unique(),
    month: char("month", { length: 7 }).notNull(),
    actualValue: decimal("actual_value", { precision: 12, scale: 2 }).notNull(),
    note: varchar("note", { length: 1000 }),
    status: mysqlEnum("status", ["DRAFT", "IN_REVIEW", "REJECTED", "SUBMITTED", "VOID"])
      .notNull()
      .default("DRAFT"),
    createdBy: int("created_by", { unsigned: true })
      .notNull()
      .references(() => users.id),
    submittedBy: int("submitted_by", { unsigned: true }).references(() => users.id),
    submittedAt: datetime("submitted_at", { mode: "date", fsp: 3 }),
    ...businessTimestamps(),
  },
  (t) => [
    uniqueIndex("service_request_unique").on(t.createdBy, t.requestKey),
    foreignKey({
      name: "service_record_target_fk",
      columns: [t.indicatorId, t.teamId],
      foreignColumns: [teamIndicatorTargets.indicatorId, teamIndicatorTargets.teamId],
    }),
    index("monthly_aggregate").on(t.indicatorId, t.teamId, t.status, t.month),
  ],
)
