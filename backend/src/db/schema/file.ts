import { datetime, int, mysqlTable, varchar, index } from "drizzle-orm/mysql-core"
import { users } from "./identity"
import { projects, businessTimestamps } from "./project"
/** 合同附件在授权项目内直接绑定，磁盘存储键只供服务器读取。 */
export const contractFiles = mysqlTable(
  "contract_files",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    projectId: int("project_id", { unsigned: true })
      .notNull()
      .references(() => projects.id),
    name: varchar("name", { length: 255 }).notNull(),
    storageKey: varchar("storage_key", { length: 100 }).notNull().unique(),
    size: int("size", { unsigned: true }).notNull(),
    contentType: varchar("content_type", { length: 150 }).notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    uploadedBy: int("uploaded_by", { unsigned: true })
      .notNull()
      .references(() => users.id),
    deletedAt: datetime("deleted_at", { mode: "date", fsp: 3 }),
    ...businessTimestamps(),
  },
  (t) => [index("contract_file_project").on(t.projectId)],
)
