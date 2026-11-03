import {
  datetime,
  double,
  foreignKey,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core"
import { users } from "./identity"
import { projects, businessTimestamps } from "./project"
import { serviceTasks } from "./task"

export interface ExecutionPolicy {
  latitude: number | null
  longitude: number | null
  radius: number
  accuracyLimit: number
  beforeMinutes: number
  afterMinutes: number
  toleranceMinutes: number
  credentialMinutes: number
  supplementHours: number
  pointId: number | null
  pointVersion: number | null
}
export interface ExecutionSnapshot {
  taskVersion: number
  startAt: string
  endAt: string
  location: string
  address: string
  policy: ExecutionPolicy
  staff: Array<{
    userId: number
    name: string
    supervisorId: number | null
    startDate: string
    endDate: string
    management: boolean
  }>
  indicators: Array<{ indicatorId: number; planId: number; periodId: number; plannedValue: string }>
}
export interface GeoSample {
  status: "OK" | "DENIED" | "UNAVAILABLE" | "TIMEOUT" | "UNSUPPORTED"
  latitude?: number
  longitude?: number
  accuracy?: number
  sampledAt?: string
}
export const executionPolicies = mysqlTable("execution_policies", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  taskId: int("task_id", { unsigned: true })
    .notNull()
    .unique()
    .references(() => serviceTasks.id),
  taskVersion: int("task_version", { unsigned: true }).notNull(),
  settings: json("settings").$type<ExecutionPolicy>().notNull(),
  updatedBy: int("updated_by", { unsigned: true })
    .notNull()
    .references(() => users.id),
  ...businessTimestamps(),
})
export const executionSessions = mysqlTable("execution_sessions", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  taskId: int("task_id", { unsigned: true })
    .notNull()
    .unique()
    .references(() => serviceTasks.id),
  status: mysqlEnum("status", ["IN_PROGRESS", "ENDED", "STOPPED"]).notNull(),
  snapshot: json("snapshot").$type<ExecutionSnapshot>().notNull(),
  sourceVersion: int("source_version", { unsigned: true }).notNull().default(1),
  startedAt: datetime("started_at", { mode: "date", fsp: 3 }).notNull(),
  startedBy: int("started_by", { unsigned: true })
    .notNull()
    .references(() => users.id),
  endedAt: datetime("ended_at", { mode: "date", fsp: 3 }),
  endedBy: int("ended_by", { unsigned: true }).references(() => users.id),
  stopReason: varchar("stop_reason", { length: 1000 }),
  endRequestKey: varchar("end_request_key", { length: 64 }),
  endFingerprint: varchar("end_fingerprint", { length: 64 }),
  stopRequestKey: varchar("stop_request_key", { length: 64 }),
  stopFingerprint: varchar("stop_fingerprint", { length: 64 }),
  ...businessTimestamps(),
})
export const serviceParticipants = mysqlTable(
  "service_participants",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    projectId: int("project_id", { unsigned: true })
      .notNull()
      .references(() => projects.id),
    code: varchar("code", { length: 40 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    phone: varchar("phone", { length: 50 }).notNull().default(""),
    status: mysqlEnum("status", ["ACTIVE", "ARCHIVED"]).notNull().default("ACTIVE"),
    createdBy: int("created_by", { unsigned: true })
      .notNull()
      .references(() => users.id),
    ...businessTimestamps(),
  },
  (t) => [uniqueIndex("participant_project_code").on(t.projectId, t.code)],
)
export const executionRosters = mysqlTable(
  "execution_rosters",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    taskId: int("task_id", { unsigned: true })
      .notNull()
      .references(() => serviceTasks.id),
    participantId: int("participant_id", { unsigned: true })
      .notNull()
      .references(() => serviceParticipants.id),
    createdBy: int("created_by", { unsigned: true })
      .notNull()
      .references(() => users.id),
    ...businessTimestamps(),
  },
  (t) => [uniqueIndex("execution_roster_unique").on(t.taskId, t.participantId)],
)
export const executionCredentials = mysqlTable(
  "execution_credentials",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    taskId: int("task_id", { unsigned: true })
      .notNull()
      .references(() => serviceTasks.id),
    rosterId: int("roster_id", { unsigned: true })
      .notNull()
      .references(() => executionRosters.id),
    purpose: mysqlEnum("purpose", ["COLLECTIVE", "HOME_CONFIRM"]).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    nonce: varchar("nonce", { length: 64 }).notNull(),
    taskVersion: int("task_version", { unsigned: true }).notNull(),
    issuerId: int("issuer_id", { unsigned: true })
      .notNull()
      .references(() => users.id),
    issuerAuthVersion: int("issuer_auth_version", { unsigned: true }).notNull(),
    requestKey: varchar("request_key", { length: 64 }).notNull(),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
    status: mysqlEnum("status", ["ACTIVE", "USED", "REVOKED"]).notNull().default("ACTIVE"),
    usedEventId: int("used_event_id", { unsigned: true }),
    ...businessTimestamps(),
  },
  (t) => [uniqueIndex("execution_credential_request").on(t.issuerId, t.requestKey)],
)
export const staffExecutionEvents = mysqlTable(
  "staff_execution_events",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    taskId: int("task_id", { unsigned: true })
      .notNull()
      .references(() => serviceTasks.id),
    userId: int("user_id", { unsigned: true })
      .notNull()
      .references(() => users.id),
    kind: mysqlEnum("kind", ["CHECK_IN", "CHECK_OUT"]).notNull(),
    method: mysqlEnum("method", ["NORMAL", "SUPPLEMENT", "CORRECTION"]).notNull(),
    slotKey: varchar("slot_key", { length: 64 }).notNull(),
    supersedesId: int("supersedes_id", { unsigned: true }).unique(),
    occurredAt: datetime("occurred_at", { mode: "date", fsp: 3 }).notNull(),
    declaredAt: datetime("declared_at", { mode: "date", fsp: 3 }).notNull(),
    receivedAt: datetime("received_at", { mode: "date", fsp: 3 }).notNull(),
    geo: json("geo").$type<GeoSample>().notNull(),
    distance: double("distance"),
    flags: json("flags").$type<string[]>().notNull(),
    reason: varchar("reason", { length: 1000 }).notNull(),
    requestKey: varchar("request_key", { length: 64 }).notNull(),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  },
  (t) => [
    uniqueIndex("staff_event_request").on(t.userId, t.requestKey),
    uniqueIndex("staff_event_slot").on(t.taskId, t.userId, t.kind, t.slotKey),
    index("staff_event_task").on(t.taskId),
  ],
)
export const participationEvents = mysqlTable(
  "participation_events",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    taskId: int("task_id", { unsigned: true })
      .notNull()
      .references(() => serviceTasks.id),
    rosterId: int("roster_id", { unsigned: true })
      .notNull()
      .references(() => executionRosters.id),
    kind: mysqlEnum("kind", ["CONFIRM", "CORRECT", "VOID"]).notNull(),
    method: mysqlEnum("method", ["SELF", "FAMILY", "ASSISTED", "SUPPLEMENT"]).notNull(),
    actorId: int("actor_id", { unsigned: true }).references(() => users.id),
    credentialId: int("credential_id", { unsigned: true }).references(
      () => executionCredentials.id,
    ),
    confirmerRole: mysqlEnum("confirmer_role", ["SELF", "FAMILY", "COMPANION", "STAFF"]).notNull(),
    relation: varchar("relation", { length: 200 }).notNull().default(""),
    reason: varchar("reason", { length: 1000 }).notNull(),
    occurredAt: datetime("occurred_at", { mode: "date", fsp: 3 }).notNull(),
    receivedAt: datetime("received_at", { mode: "date", fsp: 3 }).notNull(),
    flags: json("flags").$type<string[]>().notNull(),
    requestKey: varchar("request_key", { length: 64 }).notNull(),
    requestOwner: varchar("request_owner", { length: 60 }).notNull(),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  },
  (t) => [uniqueIndex("participation_event_request").on(t.requestOwner, t.requestKey)],
)
export const executionParticipations = mysqlTable(
  "execution_participations",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    rosterId: int("roster_id", { unsigned: true })
      .notNull()
      .unique()
      .references(() => executionRosters.id),
    currentEventId: int("current_event_id", { unsigned: true }).notNull(),
    status: mysqlEnum("status", ["RECORDED", "VOID"]).notNull(),
    requiresReview: int("requires_review").notNull().default(0),
    ...businessTimestamps(),
  },
  (t) => [
    foreignKey({
      name: "execution_participation_event_fk",
      columns: [t.currentEventId],
      foreignColumns: [participationEvents.id],
    }),
  ],
)
export const executionEvidence = mysqlTable(
  "execution_evidence",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    taskId: int("task_id", { unsigned: true })
      .notNull()
      .references(() => serviceTasks.id),
    uploadedBy: int("uploaded_by", { unsigned: true })
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 255 }).notNull(),
    contentType: varchar("content_type", { length: 100 }).notNull(),
    size: int("size", { unsigned: true }).notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    storageKey: varchar("storage_key", { length: 64 }).notNull().unique(),
    requestKey: varchar("request_key", { length: 64 }).notNull(),
    boundKind: mysqlEnum("bound_kind", ["STAFF", "PARTICIPATION", "EXCEPTION"]),
    boundId: int("bound_id", { unsigned: true }),
    deletedAt: datetime("deleted_at", { mode: "date", fsp: 3 }),
    ...businessTimestamps(),
  },
  (t) => [uniqueIndex("execution_evidence_request").on(t.uploadedBy, t.requestKey)],
)
export const executionExceptions = mysqlTable(
  "execution_exceptions",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    taskId: int("task_id", { unsigned: true })
      .notNull()
      .references(() => serviceTasks.id),
    sourceKey: varchar("source_key", { length: 150 }).notNull(),
    code: varchar("code", { length: 60 }).notNull(),
    ownerId: int("owner_id", { unsigned: true })
      .notNull()
      .references(() => users.id),
    reviewerId: int("reviewer_id", { unsigned: true }).references(() => users.id),
    sourceKind: mysqlEnum("source_kind", ["STAFF", "PARTICIPATION", "SESSION"]).notNull(),
    sourceId: int("source_id", { unsigned: true }).notNull(),
    status: mysqlEnum("status", ["OPEN", "EXPLAINED", "RESOLVED"]).notNull().default("OPEN"),
    notes: json("notes")
      .$type<
        Array<{
          actorId: number
          reason: string
          createdAt: string
          requestKey: string
          evidenceIds: number[]
        }>
      >()
      .notNull()
      .$defaultFn(() => []),
    resolvedByEventId: int("resolved_by_event_id", { unsigned: true }),
    ...businessTimestamps(),
  },
  (t) => [uniqueIndex("execution_exception_source").on(t.taskId, t.sourceKey)],
)
