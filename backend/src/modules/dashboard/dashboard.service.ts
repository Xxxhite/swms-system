import { canReadResource } from "@/modules/resource/resource.service"
import { sourceReadable } from "@/modules/management/management.authorization"
import type { Actor } from "@/utils/authorization"
import { calculateReport } from "@/modules/analysis/management.calculation"
import {
  ManagementRepository,
  managementRepository,
} from "@/modules/management/management.repository"
import { canReadFollowup } from "@/modules/management/management.authorization"
import { businessDate } from "@/modules/task/task-calendar"
export interface DutyItem {
  key: string
  title: string
  detail: string
  href: string
  dueDate: string | null
}
export interface DutyGroup {
  key: string
  title: string
  total: number
  list: DutyItem[]
  error?: string
}
export class DashboardService {
  constructor(readonly repository: ManagementRepository = managementRepository) {}
  overview(actor: Actor) {
    return this.repository.run(actor, false, (data) => {
      const current = data.actor!,
        has = (p: string) => current.profile.permissions.includes(p),
        groups: DutyGroup[] = [],
        now = new Date()
      const add = (key: string, title: string, work: () => DutyItem[]) => {
        try {
          const all = work()
          groups.push({ key, title, total: all.length, list: all.slice(0, 10) })
        } catch {
          groups.push({ key, title, total: 0, list: [], error: "暂时无法读取，请重试" })
        }
      }
      if (has("activity:view"))
        add("tasks", "我的执行任务", () =>
          calculateReport(data, current, "tasks", {}, now, "dashboard")
            .rows.filter((r) => {
              const id = Number(r.key.slice(5)),
                task = data.scheduling.tasks.find((t) => t.id === id)
              return (
                task &&
                data.scheduling.staff.some(
                  (s) => s.taskId === id && s.userId === current.user.id,
                ) &&
                !["COMPLETED", "CANCELED"].includes(String(r.stateCode))
              )
            })
            .map((r) => ({
              key: r.key,
              title: String(r.title),
              detail: `${r.status} · ${r.projectName} · 负责人${r.ownerName}`,
              href: r.href,
              dueDate: String(r.endDate),
            })),
        )
      if (has("service:monthly:approve"))
        add("approvals", "我的待审批", () =>
          calculateReport(data, current, "approvals", { status: "PENDING" }, now, "dashboard")
            .rows.filter((r) =>
              data.tasks.some(
                (t) =>
                  t.instanceId === Number(r.key.slice(9)) &&
                  t.approverId === current.user.id &&
                  t.status === "PENDING",
              ),
            )
            .map((r) => ({
              key: r.key,
              title: String(r.source),
              detail: `${r.projectName} · 等待${r.hours}小时`,
              href: r.href,
              dueDate: null,
            })),
        )
      if (has("resource:view"))
        add("resources", "我的资源跟进", () =>
          calculateReport(
            data,
            current,
            "resources",
            { ownerId: current.user.id },
            now,
            "dashboard",
          )
            .rows.filter((r) => ["OVERDUE", "PENDING"].includes(String(r.stateCode)))
            .map((r) => ({
              key: r.key,
              title: String(r.resourceName),
              detail: `${r.status} · ${r.nextAction}`,
              href: r.href,
              dueDate: r.dueDate as string | null,
            })),
        )
      if (has("management:followup:view"))
        add("management", "我的管理问题", () =>
          data.management
            .filter(
              (r) =>
                canReadFollowup(data, current, r) &&
                r.ownerId === current.user.id &&
                r.status !== "COMPLETED",
            )
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
            .map((r) => ({
              key: `management-${r.id}`,
              title: r.title,
              detail: `${r.dueDate < businessDate(now) ? "已逾期" : "待处理"} · ${r.description}`,
              href: `/service/management-followups?followupId=${r.id}`,
              dueDate: r.dueDate,
            })),
        )
      if (has("service:indicator:view") || has("analysis:report:view"))
        add("progress", "项目进度提示", () =>
          calculateReport(data, current, "progress", {}, now, "dashboard")
            .rows.filter(
              (r) =>
                r.warningLevel === "red" || (r.difference !== null && Number(r.difference) > 0),
            )
            .map((r) => ({
              key: `progress-${r.key}`,
              title: `${r.projectName} · ${r.indicatorName}`,
              detail: `${r.teamName} · ${r.status} · 正式完成${r.cumulative}${r.unit}`,
              href:
                has("analysis:view") && has("analysis:report:view")
                  ? "/analysis"
                  : has("service:monitor:view")
                    ? "/service/monitor"
                    : r.href,
              dueDate: null,
            })),
        )
      const visibleTasks = has("activity:view")
        ? calculateReport(data, current, "tasks", {}, now, "dashboard").rows
        : []
      const visibleManagement = data.management.filter((r) => canReadFollowup(data, current, r))
      const actions: Record<string, string> = {
        CREATE: "建立",
        COPY: "复制建立",
        UPDATE: "调整",
        CANCEL: "取消",
        START: "开始处理",
        NOTE: "追加进展",
        COMPLETE: "完成处理",
        REOPEN: "重新打开",
        SUBMIT: "提交审批",
        APPROVE: "审批通过",
        REJECT: "退回修改",
        WITHDRAW: "撤回",
      }
      const approvals =
        has("service:monthly:view") || has("service:monthly:approve")
          ? calculateReport(data, current, "approvals", {}, now, "dashboard").rows
          : []
      const events = [
        ...data.scheduling.plans
          .filter(
            (p) =>
              p.status === "PUBLISHED" &&
              has("service:plan:view") &&
              sourceReadable(data, current, {
                projectId: p.projectId,
                teamId: data.targets.find((t) => t.id === p.targetId)?.teamId ?? null,
                sourceId: p.id,
                sourceType: "PLAN",
              }),
          )
          .map((p) => ({
            key: `plan-${p.id}`,
            title: `阶段计划第${p.revision}版发布`,
            createdAt: p.publishedAt ?? p.updatedAt,
            href: `/service/plans/${p.id}`,
          })),
        ...data.records
          .filter((r) => approvals.some((a) => a.key === `approval-${r.instanceId}`))
          .map((r) => ({
            key: `approval-event-${r.id}`,
            title: `审批${r.instanceId} · ${actions[r.action] ?? "业务更新"}`,
            createdAt: r.createdAt,
            href: `/service/approvals?instanceId=${r.instanceId}`,
          })),
        ...data.resourceFollowups
          .filter(
            (f) =>
              has("resource:view") &&
              data.scheduling.units.some(
                (r) => r.id === f.resourceId && canReadResource(current, r),
              ),
          )
          .map((f) => ({
            key: `resource-event-${f.id}`,
            title: `资源跟进 · ${f.completed ? "已完成" : "更新记录"}`,
            createdAt: f.updatedAt,
            href: `/resource/${f.resourceId}?followupId=${f.id}`,
          })),
        ...data.scheduling.events
          .filter((e) => visibleTasks.some((r) => r.key === `task-${e.taskId}`))
          .map((e) => ({
            key: `task-event-${e.id}`,
            title: `任务${e.taskId} · ${actions[e.action] ?? "业务更新"}`,
            createdAt: e.createdAt,
            href: `/activity/${e.taskId}`,
          })),
        ...data.managementEvents
          .filter((e) => visibleManagement.some((r) => r.id === e.followupId))
          .map((e) => ({
            key: `management-event-${e.id}`,
            title: `${visibleManagement.find((r) => r.id === e.followupId)!.title} · ${actions[e.action] ?? "业务更新"}`,
            createdAt: e.createdAt,
            href: `/service/management-followups?followupId=${e.followupId}`,
          })),
      ]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 10)
      return { groups, events, generatedAt: now.toISOString() }
    })
  }
}
