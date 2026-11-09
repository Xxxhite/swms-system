import {
  mysqlTable,
  int,
  varchar,
  mysqlEnum,
  date,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/mysql-core"
import { users } from "./identity"
import { serviceTasks } from "./task"
import { businessTimestamps } from "./project"

/** 一任务一份汇总；更正、作废及恢复历史沿用审计日志。 */
export const serviceTaskFeedback = mysqlTable(
  "service_task_feedback",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    taskId: int("task_id", { unsigned: true }).notNull(),
    satisfiedCount: int("satisfied_count", { unsigned: true }).notNull(),
    neutralCount: int("neutral_count", { unsigned: true }).notNull(),
    dissatisfiedCount: int("dissatisfied_count", { unsigned: true }).notNull(),
    source: mysqlEnum("source", ["PAPER", "ORAL", "PHONE", "OTHER"]).notNull(),
    sourceNote: varchar("source_note", { length: 500 }).notNull().default(""),
    feedbackDate: date("feedback_date", { mode: "string" }).notNull(),
    suggestions: varchar("suggestions", { length: 2000 }).notNull().default(""),
    status: mysqlEnum("status", ["ACTIVE", "VOID"]).notNull().default("ACTIVE"),
    voidReason: varchar("void_reason", { length: 1000 }).notNull().default(""),
    createdBy: int("created_by", { unsigned: true })
      .notNull()
      .references(() => users.id),
    updatedBy: int("updated_by", { unsigned: true })
      .notNull()
      .references(() => users.id),
    ...businessTimestamps(),
  },
  (t) => [
    uniqueIndex("task_feedback_unique").on(t.taskId),
    foreignKey({
      name: "task_feedback_task_fk",
      columns: [t.taskId],
      foreignColumns: [serviceTasks.id],
    }),
  ],
)
