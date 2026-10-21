import {
  datetime,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  uniqueIndex,
  varchar,
  index,
} from "drizzle-orm/mysql-core"
import { users } from "./identity"
import { businessTimestamps } from "./project"
import { monthlyReports } from "./indicator"
/** 月报变更表：保存更正、撤销或恢复的前后值及原因，在途槽位禁止重复申请。 */
export const monthlyReportChanges = mysqlTable("monthly_report_changes", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  reportId: int("report_id", { unsigned: true })
    .notNull()
    .references(() => monthlyReports.id),
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
    .references(() => monthlyReports.id),
  ...businessTimestamps(),
})
/** 审批实例表：冻结业务内容与节点人员；本阶段仅月报变更单级审批。 */
export const approvalInstances = mysqlTable(
  "approval_instances",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    businessType: varchar("business_type", { length: 32 }).notNull(),
    businessId: int("business_id", { unsigned: true }).notNull(),
    round: int("round", { unsigned: true }).notNull().default(1),
    applicantId: int("applicant_id", { unsigned: true })
      .notNull()
      .references(() => users.id),
    status: mysqlEnum("status", ["IN_REVIEW", "APPROVED", "REJECTED", "CANCELLED"])
      .notNull()
      .default("IN_REVIEW"),
    currentNodeNo: int("current_node_no").notNull().default(1),
    workflowSnapshot: json("workflow_snapshot").notNull(),
    businessSnapshot: json("business_snapshot").notNull(),
    completedAt: datetime("completed_at", { mode: "date", fsp: 3 }),
    ...businessTimestamps(),
  },
  (t) => [uniqueIndex("approval_business_round").on(t.businessType, t.businessId, t.round)],
)
/** 审批任务表：每个节点的实际审批人及决策状态，不能由无关管理员代审。 */
export const approvalTasks = mysqlTable(
  "approval_tasks",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    instanceId: int("instance_id", { unsigned: true })
      .notNull()
      .references(() => approvalInstances.id),
    nodeNo: int("node_no").notNull().default(1),
    approverId: int("approver_id", { unsigned: true })
      .notNull()
      .references(() => users.id),
    status: mysqlEnum("status", ["PENDING", "APPROVED", "REJECTED", "CANCELLED"])
      .notNull()
      .default("PENDING"),
    decidedAt: datetime("decided_at", { mode: "date", fsp: 3 }),
    ...businessTimestamps(),
  },
  (t) => [
    uniqueIndex("task_node_approver").on(t.instanceId, t.nodeNo, t.approverId),
    index("task_inbox").on(t.approverId, t.status),
  ],
)
/** 审批记录表：追加保存提交、通过、驳回及撤回，不改写历史意见。 */
export const approvalRecords = mysqlTable("approval_records", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  instanceId: int("instance_id", { unsigned: true })
    .notNull()
    .references(() => approvalInstances.id),
  taskId: int("task_id", { unsigned: true }).references(() => approvalTasks.id),
  actorId: int("actor_id", { unsigned: true })
    .notNull()
    .references(() => users.id),
  action: mysqlEnum("action", ["SUBMIT", "APPROVE", "REJECT", "WITHDRAW"]).notNull(),
  comment: varchar("comment", { length: 1000 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 })
    .notNull()
    .$defaultFn(() => new Date()),
})
