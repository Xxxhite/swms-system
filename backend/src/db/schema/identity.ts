import {
  type AnyMySqlColumn,
  datetime,
  date,
  int,
  json,
  boolean,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  varchar,
} from "drizzle-orm/mysql-core"

/** 账号状态：区分待审核、被驳回、启用、停用和离职。 */
export const accountStatuses = ["PENDING", "REJECTED", "ACTIVE", "DISABLED", "LEFT"] as const
/** 数据范围编码：与角色功能权限分开保存，用于服务端过滤业务记录。 */
export const dataScopes = ["SELF", "TEAM", "SUBTREE", "ALL"] as const
/** 组织节点类型：总部、部门和团队共用同一棵组织树。 */
export const orgTypes = ["HEADQUARTERS", "DEPARTMENT", "TEAM"] as const
/** 生成共用时间字段和初始资料版本，更新时间由 ORM 写入钩子维护。 */
const timestamps = () => ({
  createdAt: datetime("created_at", { mode: "date", fsp: 3 })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
  version: int("version", { unsigned: true }).notNull().default(1),
})

/** 组织表（organizations）：保存组织树、节点类型和启停状态，作为人员归属及范围计算依据。 */
export const organizations = mysqlTable("organizations", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  parentId: int("parent_id", { unsigned: true }).references((): AnyMySqlColumn => organizations.id),
  code: varchar("code", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  type: mysqlEnum("type", orgTypes).notNull(),
  status: mysqlEnum("status", ["ACTIVE", "DISABLED"]).notNull().default("ACTIVE"),
  sortOrder: int("sort_order").notNull().default(0),
  ...timestamps(),
})

/** 人员表（users）：合并保存注册资料、任职关系、审核结果、密码哈希及认证版本。 */
export const users = mysqlTable("users", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  username: varchar("username", { length: 32 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 50 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  arrivalDate: date("arrival_date", { mode: "string" }).notNull(),
  major: varchar("major", { length: 100 }).notNull(),
  socialWorkerNo: varchar("social_worker_no", { length: 100 }),
  serviceFieldCode: varchar("service_field_code", { length: 100 }),
  serviceFieldCodes: json("service_field_codes")
    .$type<string[]>()
    .notNull()
    .$defaultFn(() => []),
  isSupervisor: boolean("is_supervisor").notNull().default(false),
  proposedPosition: varchar("proposed_position", { length: 100 }).notNull(),
  proposedTeam: varchar("proposed_team", { length: 100 }),
  orgId: int("org_id", { unsigned: true }).references(() => organizations.id),
  positionCode: varchar("position_code", { length: 32 }),
  education: varchar("education", { length: 100 }).notNull(),
  politicalStatus: varchar("political_status", { length: 100 }).notNull(),
  supervisorId: int("supervisor_id", { unsigned: true }).references((): AnyMySqlColumn => users.id),
  dataScope: mysqlEnum("data_scope", dataScopes).notNull().default("SELF"),
  status: mysqlEnum("status", accountStatuses).notNull().default("PENDING"),
  reviewComment: varchar("review_comment", { length: 1000 }),
  reviewedBy: int("reviewed_by", { unsigned: true }).references((): AnyMySqlColumn => users.id),
  reviewedAt: datetime("reviewed_at", { mode: "date", fsp: 3 }),
  authVersion: int("auth_version", { unsigned: true }).notNull().default(1),
  ...timestamps(),
})

/** 角色表（roles）：定义可分配的系统职责，岗位职务单独保存在人员记录中。 */
export const roles = mysqlTable("roles", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: varchar("description", { length: 1000 }).notNull().default(""),
  status: mysqlEnum("status", ["ACTIVE", "DISABLED"]).notNull().default("ACTIVE"),
  builtIn: int("built_in").notNull().default(0),
  ...timestamps(),
})

/** 权限目录表（permissions）：保存菜单入口及具体功能动作的编码与名称。 */
export const permissions = mysqlTable("permissions", {
  code: varchar("code", { length: 100 }).primaryKey(),
  module: varchar("module", { length: 50 }).notNull(),
  resource: varchar("resource", { length: 50 }).notNull(),
  action: varchar("action", { length: 32 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
})
/** 角色权限关联表（role_permissions）：定义每个角色拥有的功能权限，复合主键防止重复授权。 */
export const rolePermissions = mysqlTable(
  "role_permissions",
  {
    roleId: int("role_id", { unsigned: true })
      .notNull()
      .references(() => roles.id),
    permissionCode: varchar("permission_code", { length: 100 })
      .notNull()
      .references(() => permissions.code),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionCode] })],
)
/** 人员角色关联表（user_roles）：允许一人拥有多个角色，角色权限在认证时合并。 */
export const userRoles = mysqlTable(
  "user_roles",
  {
    userId: int("user_id", { unsigned: true })
      .notNull()
      .references(() => users.id),
    roleId: int("role_id", { unsigned: true })
      .notNull()
      .references(() => roles.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
)
/** 个人附加权限表（user_extra_permissions）：在角色权限之外为指定人员增加功能权限。 */
export const userExtraPermissions = mysqlTable(
  "user_extra_permissions",
  {
    userId: int("user_id", { unsigned: true })
      .notNull()
      .references(() => users.id),
    permissionCode: varchar("permission_code", { length: 100 })
      .notNull()
      .references(() => permissions.code),
  },
  (t) => [primaryKey({ columns: [t.userId, t.permissionCode] })],
)
/** 人员负责组织表（user_managed_orgs）：保存 SUBTREE 范围的根节点，查询时展开其下级组织。 */
export const userManagedOrgs = mysqlTable(
  "user_managed_orgs",
  {
    userId: int("user_id", { unsigned: true })
      .notNull()
      .references(() => users.id),
    orgId: int("org_id", { unsigned: true })
      .notNull()
      .references(() => organizations.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.orgId] })],
)
