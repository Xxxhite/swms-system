import type { BusinessConnection } from "@/modules/project/project.repository"
/** 将业务变更与审计记录写入同一事务，日志不记录密码或认证凭证。 */
export async function businessAudit(
  tx: BusinessConnection,
  actorId: number,
  action: string,
  entityType: string,
  entityId: number,
  beforeData: unknown,
  afterData: unknown,
) {
  await tx.auditLogs.insert({ actorId, action, entityType, entityId, beforeData, afterData })
}
