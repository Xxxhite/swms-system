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
  json,
} from "drizzle-orm/mysql-core"
import { organizations, users } from "./identity"

/** 业务表通用创建、更新时间及乐观版本。每次调用生成独立列对象。 */
export const businessTimestamps = () => ({
  createdAt: datetime("created_at", { mode: "date", fsp: 3 })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
  version: int("version", { unsigned: true }).notNull().default(1),
})
/** 合同包项目主表：总部与基金另表保存，删除后保留编码和历史。 */
export const projects = mysqlTable(
  "contract_projects",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    code: varchar("code", { length: 32 }).notNull().unique(),
    name: varchar("name", { length: 150 }).notNull(),
    category: mysqlEnum("category", ["CONTRACT_PACKAGE"]).notNull().default("CONTRACT_PACKAGE"),
    ownerOrgId: int("owner_org_id", { unsigned: true })
      .notNull()
      .references(() => organizations.id),
    directorId: int("director_id", { unsigned: true })
      .notNull()
      .references(() => users.id),
    seniorDirectorId: int("senior_director_id", { unsigned: true })
      .notNull()
      .references(() => users.id),
    supervisorId: int("supervisor_id", { unsigned: true }).references(() => users.id),
    subFieldCodes: json("sub_field_codes")
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
    brandCodes: json("brand_codes")
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
    serviceFieldCode: varchar("service_field_code", { length: 100 }).notNull(),
    status: mysqlEnum("status", ["DRAFT", "ACTIVE"]).notNull().default("DRAFT"),
    createdBy: int("created_by", { unsigned: true })
      .notNull()
      .references(() => users.id),
    deletedAt: datetime("deleted_at", { mode: "date", fsp: 3 }),
    ...businessTimestamps(),
  },
  (t) => [index("projects_owner_status").on(t.ownerOrgId, t.status)],
)
/** 项目合同表：一项目一份合同，日期为业务自然日期，金额使用精确小数。 */
export const projectContracts = mysqlTable("contract_contracts", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  projectId: int("project_id", { unsigned: true })
    .notNull()
    .unique()
    .references(() => projects.id),
  contractNo: varchar("contract_no", { length: 100 }),
  partnerName: varchar("partner_name", { length: 150 }).notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  serviceArea: varchar("service_area", { length: 100 }).notNull(),
  note: text("note"),
  ...businessTimestamps(),
})
/** 服务点表：项目下的服务位置，填报数量不按服务点重复拆分。 */
export const projectServicePoints = mysqlTable("contract_service_points", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  projectId: int("project_id", { unsigned: true })
    .notNull()
    .references(() => projects.id),
  name: varchar("name", { length: 100 }).notNull(),
  address: varchar("address", { length: 255 }),
  note: varchar("note", { length: 1000 }),
  deletedAt: datetime("deleted_at", { mode: "date", fsp: 3 }),
  ...businessTimestamps(),
})
/** 项目服务团队表：保存团队及填报责任，历史引用存在时禁止移除。 */
export const projectTeams = mysqlTable(
  "contract_teams",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    projectId: int("project_id", { unsigned: true })
      .notNull()
      .references(() => projects.id),
    teamId: int("team_id", { unsigned: true })
      .notNull()
      .references(() => organizations.id),
    reporterId: int("reporter_id", { unsigned: true })
      .notNull()
      .references(() => users.id),
    ...businessTimestamps(),
  },
  (t) => [
    uniqueIndex("project_team_unique").on(t.projectId, t.teamId),
    index("project_team_reverse").on(t.teamId, t.projectId),
  ],
)

/** 总部与基金项目只保留独立存储，本阶段不开放业务维护接口。 */
export const headquartersProjects = mysqlTable("headquarters_projects", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 150 }).notNull(),
  category: mysqlEnum("category", ["HEADQUARTERS", "FUND"]).notNull(),
  ownerOrgId: int("owner_org_id", { unsigned: true })
    .notNull()
    .references(() => organizations.id),
  directorId: int("director_id", { unsigned: true })
    .notNull()
    .references(() => users.id),
  legacyProjectId: int("legacy_project_id", { unsigned: true }).unique(),
  ...businessTimestamps(),
})
/** 成员有效归属按人员校验；历史关系保留，团队可服务于多个不同时段项目。 */
export const projectMemberships = mysqlTable(
  "contract_memberships",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    projectId: int("project_id", { unsigned: true })
      .notNull()
      .references(() => projects.id),
    teamId: int("team_id", { unsigned: true })
      .notNull()
      .references(() => organizations.id),
    userId: int("user_id", { unsigned: true })
      .notNull()
      .references(() => users.id),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    ...businessTimestamps(),
  },
  (t) => [
    index("membership_user_dates").on(t.userId, t.startDate, t.endDate),
    uniqueIndex("membership_project_user").on(t.projectId, t.userId),
  ],
)
