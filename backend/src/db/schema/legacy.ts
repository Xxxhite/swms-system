import {
  date,
  datetime,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  varchar,
  uniqueIndex,
  index,
  char,
  foreignKey,
} from "drizzle-orm/mysql-core"
import { organizations, users } from "./identity"
/** 第二阶段原始业务表只作为历史迁移来源，新的业务读写使用合同包与服务记录表。 */
/** 业务表通用创建、更新时间及乐观版本。每次调用生成独立列对象。 */
export const legacyBusinessTimestamps = () => ({
  createdAt: datetime("created_at", { mode: "date", fsp: 3 })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
  version: int("version", { unsigned: true }).notNull().default(1),
})
/** 项目主表：合同包、总部及基金项目统一登记，删除后保留编码和历史。 */
export const legacyProjects = mysqlTable(
  "projects",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    code: varchar("code", { length: 32 }).notNull().unique(),
    name: varchar("name", { length: 150 }).notNull(),
    category: mysqlEnum("category", ["CONTRACT_PACKAGE", "HEADQUARTERS", "FUND"]).notNull(),
    ownerOrgId: int("owner_org_id", { unsigned: true })
      .notNull()
      .references(() => organizations.id),
    directorId: int("director_id", { unsigned: true })
      .notNull()
      .references(() => users.id),
    supervisorId: int("supervisor_id", { unsigned: true })
      .notNull()
      .references(() => users.id),
    serviceFieldCode: varchar("service_field_code", { length: 100 }).notNull(),
    status: mysqlEnum("status", ["DRAFT", "ACTIVE"]).notNull().default("DRAFT"),
    createdBy: int("created_by", { unsigned: true })
      .notNull()
      .references(() => users.id),
    deletedAt: datetime("deleted_at", { mode: "date", fsp: 3 }),
    ...legacyBusinessTimestamps(),
  },
  (t) => [index("projects_owner_status").on(t.ownerOrgId, t.status)],
)
/** 项目合同表：一项目一份合同，日期为业务自然日期，金额使用精确小数。 */
export const legacyProjectContracts = mysqlTable("project_contracts", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  projectId: int("project_id", { unsigned: true })
    .notNull()
    .unique()
    .references(() => legacyProjects.id),
  contractNo: varchar("contract_no", { length: 100 }),
  partnerName: varchar("partner_name", { length: 150 }).notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  serviceArea: varchar("service_area", { length: 100 }).notNull(),
  note: text("note"),
  ...legacyBusinessTimestamps(),
})
/** 服务点表：项目下的服务位置，填报数量不按服务点重复拆分。 */
export const legacyProjectServicePoints = mysqlTable("project_service_points", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  projectId: int("project_id", { unsigned: true })
    .notNull()
    .references(() => legacyProjects.id),
  name: varchar("name", { length: 100 }).notNull(),
  address: varchar("address", { length: 255 }),
  note: varchar("note", { length: 1000 }),
  deletedAt: datetime("deleted_at", { mode: "date", fsp: 3 }),
  ...legacyBusinessTimestamps(),
})
/** 项目团队表：承担关系及当前填报负责人，历史引用存在时禁止移除。 */
export const legacyProjectTeams = mysqlTable(
  "project_teams",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    projectId: int("project_id", { unsigned: true })
      .notNull()
      .references(() => legacyProjects.id),
    teamId: int("team_id", { unsigned: true })
      .notNull()
      .references(() => organizations.id),
    reporterId: int("reporter_id", { unsigned: true })
      .notNull()
      .references(() => users.id),
    ...legacyBusinessTimestamps(),
  },
  (t) => [
    uniqueIndex("project_team_unique").on(t.projectId, t.teamId),
    index("project_team_reverse").on(t.teamId, t.projectId),
  ],
)

/** 项目指标表：同名指标依项目及统计口径独立管理。 */
export const legacyProjectIndicators = mysqlTable(
  "project_indicators",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    projectId: int("project_id", { unsigned: true })
      .notNull()
      .references(() => legacyProjects.id),
    name: varchar("name", { length: 150 }).notNull(),
    unit: varchar("unit", { length: 20 }).notNull(),
    definition: text("definition").notNull(),
    targetValue: decimal("target_value", { precision: 12, scale: 2 }).notNull(),
    status: mysqlEnum("status", ["DRAFT", "ACTIVE"]).notNull().default("DRAFT"),
    deletedAt: datetime("deleted_at", { mode: "date", fsp: 3 }),
    ...legacyBusinessTimestamps(),
  },
  (t) => [index("indicator_project").on(t.projectId)],
)
/** 团队指标目标表：指标启用前核对团队目标之和，已有月报的分配保留。 */
export const legacyTeamIndicatorTargets = mysqlTable(
  "team_indicator_targets",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    indicatorId: int("indicator_id", { unsigned: true })
      .notNull()
      .references(() => legacyProjectIndicators.id),
    teamId: int("team_id", { unsigned: true })
      .notNull()
      .references(() => organizations.id),
    targetValue: decimal("target_value", { precision: 12, scale: 2 }).notNull(),
    ...legacyBusinessTimestamps(),
  },
  (t) => [uniqueIndex("indicator_team_unique").on(t.indicatorId, t.teamId)],
)
/** 月报表：团队、指标、月份的永久唯一槽位；仅正式提交的新增量参与累计。 */
export const legacyMonthlyReports = mysqlTable(
  "monthly_reports",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    indicatorId: int("indicator_id", { unsigned: true }).notNull(),
    teamId: int("team_id", { unsigned: true }).notNull(),
    month: char("month", { length: 7 }).notNull(),
    actualValue: decimal("actual_value", { precision: 12, scale: 2 }).notNull(),
    note: varchar("note", { length: 1000 }),
    status: mysqlEnum("status", ["DRAFT", "SUBMITTED", "VOID"]).notNull().default("DRAFT"),
    createdBy: int("created_by", { unsigned: true })
      .notNull()
      .references(() => users.id),
    submittedBy: int("submitted_by", { unsigned: true }).references(() => users.id),
    submittedAt: datetime("submitted_at", { mode: "date", fsp: 3 }),
    ...legacyBusinessTimestamps(),
  },
  (t) => [
    uniqueIndex("monthly_slot_unique").on(t.indicatorId, t.teamId, t.month),
    foreignKey({
      name: "monthly_target_fk",
      columns: [t.indicatorId, t.teamId],
      foreignColumns: [legacyTeamIndicatorTargets.indicatorId, legacyTeamIndicatorTargets.teamId],
    }),
    index("monthly_aggregate").on(t.indicatorId, t.teamId, t.status, t.month),
  ],
)

/** 月报变更表：保存更正、撤销或恢复的前后值及原因，在途槽位禁止重复申请。 */
export const legacyMonthlyReportChanges = mysqlTable("monthly_report_changes", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  reportId: int("report_id", { unsigned: true })
    .notNull()
    .references(() => legacyMonthlyReports.id),
  operation: mysqlEnum("operation", ["CORRECT", "DELETE", "RESTORE"]).notNull(),
  reportVersion: int("report_version", { unsigned: true }).notNull(),
  beforeValue: varchar("before_value", { length: 32 }).notNull(),
  beforeStatus: varchar("before_status", { length: 20 }).notNull(),
  proposedValue: varchar("proposed_value", { length: 32 }).notNull(),
  proposedNote: varchar("proposed_note", { length: 1000 }),
  reason: varchar("reason", { length: 1000 }).notNull(),
  applicantId: int("applicant_id", { unsigned: true })
    .notNull()
    .references(() => users.id),
  pendingReportId: int("pending_report_id", { unsigned: true })
    .unique()
    .references(() => legacyMonthlyReports.id),
  ...legacyBusinessTimestamps(),
})
