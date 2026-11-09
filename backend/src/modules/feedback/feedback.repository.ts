import { asc, eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import * as s from "@/db/schema"
import { loadBusinessState, type BusinessState } from "@/modules/project/project.repository"
import type { Database } from "@/modules/identity/identity.repository"
import { actorFrom } from "@/modules/identity/identity.service"
import { AppError } from "@/utils/errors"
import type { Actor } from "@/utils/authorization"
import { resourceWriter } from "@/modules/resource/resource.repository"
import type { ManagementState } from "@/modules/management/management.repository"
export type FeedbackRow = typeof s.serviceTaskFeedback.$inferSelect
export type FeedbackState = ManagementState & {
  feedback: FeedbackRow[]
  resources: (typeof s.resources.$inferSelect)[]
  qualityEvents: (typeof s.auditLogs.$inferSelect)[]
}
type Connection = Parameters<Parameters<Database["transaction"]>[0]>[0]
/** 质量业务使用单个事务快照；SQL和写入全部集中在仓储。锁顺序沿用身份→项目→资源。 */
export class FeedbackRepository {
  constructor(readonly database: Database = db) {}
  run<T>(
    actor: Actor,
    write: boolean,
    work: (data: FeedbackState, writer: ReturnType<typeof feedbackWriter>) => Promise<T> | T,
  ): Promise<T> {
    return this.database.transaction(async (tx) => {
      const base: BusinessState = await loadBusinessState(tx, undefined, write)
      const user = base.identity.users.find((u) => u.id === actor.user.id)
      if (!user || user.status !== "ACTIVE" || user.authVersion !== actor.user.authVersion)
        throw AppError.tokenExpired()
      const current = actorFrom(base.identity, user)
      if (actor.profile.permissions.some((p) => !current.profile.permissions.includes(p)))
        throw AppError.forbidden("权限已变化，请刷新后重试")
      const resourceQuery = tx.select().from(s.resources).orderBy(asc(s.resources.id))
      const resources = await (write ? resourceQuery.for("update") : resourceQuery)
      return work(
        {
          ...base,
          actor: current,
          resources,
          feedback: await tx.select().from(s.serviceTaskFeedback),
          cooperations: await tx.select().from(s.resourceCooperations),
          resourceFollowups: await tx.select().from(s.resourceFollowups),
          management: await tx.select().from(s.managementFollowups),
          managementEvents: await tx.select().from(s.managementFollowupEvents),
          qualityEvents: await tx
            .select()
            .from(s.auditLogs)
            .where(inArray(s.auditLogs.entityType, ["task_feedback", "cooperation_evaluation"])),
        },
        feedbackWriter(tx),
      )
    })
  }
}
function feedbackWriter(tx: Connection) {
  return {
    async insert(values: typeof s.serviceTaskFeedback.$inferInsert) {
      const [r] = await tx.insert(s.serviceTaskFeedback).values(values)
      return r.insertId
    },
    update(id: number, values: Partial<typeof s.serviceTaskFeedback.$inferInsert>) {
      return tx.update(s.serviceTaskFeedback).set(values).where(eq(s.serviceTaskFeedback.id, id))
    },
    resources: resourceWriter(tx),
    async audit(values: typeof s.auditLogs.$inferInsert) {
      await tx.insert(s.auditLogs).values(values)
    },
  }
}
export const feedbackRepository = new FeedbackRepository()
