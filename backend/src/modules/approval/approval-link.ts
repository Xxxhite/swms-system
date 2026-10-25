import type { BusinessState } from "@/modules/project/project.repository"
/** 旧审批必须同时对应原始变更、原月报和迁移标识，防止不同业务复用数字编号。 */
export function matchesRecordChange(
  data: BusinessState,
  instance: { businessType: string; businessId: number },
  change: { id: number; reportId: number },
): boolean {
  if (instance.businessId !== change.id) return false
  if (instance.businessType === "SERVICE_CHANGE") return true
  if (instance.businessType !== "MONTHLY_CHANGE") return false
  const source = data.legacyChanges.find((c) => c.id === instance.businessId)
  const migrated = data.reports.find((r) => r.id === change.reportId)
  return (
    !!source && source.reportId === change.reportId && migrated?.legacyReportId === source.reportId
  )
}
/** 未接入总部流程的历史任务仅保留查询，已迁移合同包及新记录才允许处理。 */
export function isHandledApproval(
  data: BusinessState,
  instance: { businessType: string; businessId: number },
): boolean {
  if (instance.businessType === "SERVICE_SUBMISSION")
    return data.reports.some((r) => r.id === instance.businessId)
  return data.changes.some((c) => matchesRecordChange(data, instance, c))
}
