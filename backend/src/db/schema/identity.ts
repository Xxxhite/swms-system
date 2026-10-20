import {
  type AnyMySqlColumn,
  datetime,
  date,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  varchar,
} from "drizzle-orm/mysql-core"

export const accountStatuses = ["PENDING", "REJECTED", "ACTIVE", "DISABLED", "LEFT"] as const
export const dataScopes = ["SELF", "TEAM", "SUBTREE", "ALL"] as const
export const orgTypes = ["HEADQUARTERS", "DEPARTMENT", "TEAM"] as const
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

export const roles = mysqlTable("roles", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: varchar("description", { length: 1000 }).notNull().default(""),
  status: mysqlEnum("status", ["ACTIVE", "DISABLED"]).notNull().default("ACTIVE"),
  builtIn: int("built_in").notNull().default(0),
  ...timestamps(),
})

export const permissions = mysqlTable("permissions", {
  code: varchar("code", { length: 100 }).primaryKey(),
  module: varchar("module", { length: 50 }).notNull(),
  resource: varchar("resource", { length: 50 }).notNull(),
  action: varchar("action", { length: 32 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
})
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
