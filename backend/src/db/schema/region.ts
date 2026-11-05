import {
  boolean,
  foreignKey,
  index,
  json,
  mysqlEnum,
  mysqlTable,
  tinyint,
  varchar,
  int,
} from "drizzle-orm/mysql-core"

export interface RegionPathItem {
  code: string
  name: string
}
export const administrativeRegions = mysqlTable(
  "administrative_regions",
  {
    code: varchar("code", { length: 24 }).primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    parentCode: varchar("parent_code", { length: 24 }),
    level: tinyint("level").notNull(),
    kind: mysqlEnum("kind", ["ADMIN", "SERVICE"]).notNull().default("ADMIN"),
    enabled: boolean("enabled").notNull().default(true),
    sortOrder: int("sort_order").notNull().default(0),
  },
  (t) => [
    index("region_parent").on(t.parentCode),
    foreignKey({ columns: [t.parentCode], foreignColumns: [t.code], name: "region_parent_fk" }),
  ],
)
export const regionColumns = (reference = true) => ({
  regionCode: reference
    ? varchar("region_code", { length: 24 }).references(() => administrativeRegions.code)
    : varchar("region_code", { length: 24 }),
  regionPathSnapshot: json("region_path_snapshot").$type<RegionPathItem[]>(),
})
