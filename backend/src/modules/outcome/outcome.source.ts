import { calculateOutcome } from "./outcome.calculation"
import type { BusinessState } from "@/modules/project/project.repository"
import type { OutcomeSource } from "@/db/schema/outcome"
import { businessDate } from "@/modules/task/task-calendar"
import { currentStaffEvents } from "@/modules/execution/execution.shared"
import { AppError } from "@/utils/errors"

export function calculationRule(data: BusinessState, indicatorId: number, date: string) {
  return data.outcomes.rules
    .filter((r) => r.indicatorId === indicatorId && r.effectiveDate <= date)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.revision - a.revision)[0]
}
export function outcomeSource(
  data: BusinessState,
  taskId: number,
  summary: string,
  manualValues: Record<string, string> = {},
): OutcomeSource {
  const task = data.scheduling.tasks.find((t) => t.id === taskId)!,
    session = data.executions.sessions.find((s) => s.taskId === taskId)
  if (!task || !session?.endedAt || session.status === "IN_PROGRESS")
    throw AppError.conflict("本次服务尚未结束")
  const events = currentStaffEvents(data, taskId),
    date = businessDate(session.startedAt)
  const staff = session.snapshot.staff.map((s) => {
    const enter = events.find((e) => e.userId === s.userId && e.kind === "CHECK_IN"),
      exit = events.find((e) => e.userId === s.userId && e.kind === "CHECK_OUT")
    return {
      id: s.userId,
      name: s.name,
      inId: enter?.id ?? null,
      outId: exit?.id ?? null,
      startAt: enter?.occurredAt.toISOString() ?? null,
      endAt: exit?.occurredAt.toISOString() ?? null,
      flags: [...new Set([...(enter?.flags ?? []), ...(exit?.flags ?? [])])],
      location:
        session.snapshot.policy.locationCheckEnabled === false
          ? "按服务地点登记"
          : [enter, exit]
              .filter(Boolean)
              .map(
                (e) =>
                  `${e!.geo.status}；距离${Math.round(e!.distance ?? 0)}米，精度${Math.round(e!.geo.accuracy ?? 0)}米`,
              )
              .join("；"),
    }
  })
  const participants = data.executions.rosters
    .filter((r) => r.taskId === taskId)
    .flatMap((r) => {
      const fact = data.executions.participations.find((f) => f.rosterId === r.id),
        event = data.executions.participationEvents.find((e) => e.id === fact?.currentEventId),
        person = data.executions.participants.find((p) => p.id === r.participantId)
      return fact && event && person
        ? [
            {
              id: person.id,
              name: person.name,
              rosterId: r.id,
              eventId: event.id,
              occurredAt: event.occurredAt.toISOString(),
              method: event.method,
              status: fact.status,
              flags: event.flags,
            },
          ]
        : []
    })
  const issues: OutcomeSource["issues"] = data.executions.exceptions
    .filter(
      (e) =>
        e.taskId === taskId &&
        e.status !== "RESOLVED" &&
        (e.sourceKind === "SESSION" ||
          (e.sourceKind === "STAFF" && events.some((s) => s.id === e.sourceId)) ||
          (e.sourceKind === "PARTICIPATION" && participants.some((p) => p.eventId === e.sourceId))),
    )
    .map((e) => {
      const event =
          e.sourceKind === "STAFF"
            ? data.executions.staffEvents.find((s) => s.id === e.sourceId)
            : e.sourceKind === "PARTICIPATION"
              ? data.executions.participationEvents.find((p) => p.id === e.sourceId)
              : undefined,
        part = participants.find((p) => p.eventId === e.sourceId)
      return {
        key: `EXCEPTION:${e.id}`,
        label: e.code,
        target: e.code === "MISSING_CHECKOUT" ? ("STAFF" as const) : e.sourceKind,
        targetId:
          e.code === "MISSING_CHECKOUT" || e.sourceKind === "STAFF"
            ? e.ownerId
            : e.sourceKind === "PARTICIPATION"
              ? (part?.id ?? -1)
              : taskId,
        reason: event?.reason ?? "",
        notes: e.notes,
      }
    })
  for (const s of session.registration ? [] : staff)
    if ((!s.inId || !s.outId) && !issues.some((i) => i.target === "STAFF" && i.targetId === s.id))
      issues.push({
        key: `MISSING_STAFF:${s.id}`,
        label: "工作人员到离不完整",
        target: "STAFF",
        targetId: s.id,
        reason: s.name,
        notes: [],
      })
  const rules = session.snapshot.indicators.map((i) => {
    const indicator = data.indicators.find((r) => r.id === i.indicatorId)
    if (!indicator) throw AppError.conflict("任务原指标已不可用")
    const rule = calculationRule(data, i.indicatorId, date),
      link = data.outcomes.links.find(
        (l) => l.taskId === taskId && l.indicatorId === i.indicatorId,
      ),
      draft = data.outcomes.snapshots.find((s) => s.id === link?.draftSnapshotId),
      record = data.reports.find((r) => r.id === link?.recordId),
      frozen = draft?.data.rules.find((r) => r.indicatorId === i.indicatorId)
    const mode = frozen?.mode ?? rule?.mode ?? "MANUAL"
    return {
      indicatorId: i.indicatorId,
      indicatorName: indicator.name,
      unit: frozen?.unit ?? indicator.unit,
      mode,
      ruleId: frozen ? frozen.ruleId : (rule?.id ?? null),
      ruleVersion: frozen ? frozen.ruleVersion : (rule?.revision ?? 0),
      manualValue:
        mode === "MANUAL"
          ? (manualValues[String(i.indicatorId)] ??
            draft?.data.rules.find((r) => r.indicatorId === i.indicatorId)?.manualValue ??
            record?.actualValue ??
            "0.00")
          : "0.00",
      plannedValue: i.plannedValue,
    }
  })
  const registeredPeople = session.registration
    ? [...new Set(session.registration.indicators.flatMap((r) => r.participantIds))].map((id) => {
        const p = data.executions.participants.find((p) => p.id === id)!
        return {
          id,
          name: p?.name ?? "原服务对象",
          rosterId: 0,
          eventId: 0,
          occurredAt: session.registration!.submittedAt,
          method: "REGISTRATION",
          status: "RECORDED",
          flags: [] as string[],
        }
      })
    : participants
  const registeredStaff = session.registration
    ? [
        ...new Map(
          session.registration.indicators
            .flatMap((r) => r.intervals)
            .map((i) => [`${i.userId}:${i.startAt}:${i.endAt}`, i]),
        ).values(),
      ].map((i) => ({
        id: i.userId,
        name: session.snapshot.staff.find((s) => s.userId === i.userId)?.name ?? "原工作人员",
        inId: null,
        outId: null,
        startAt: i.startAt,
        endAt: i.endAt,
        flags: [] as string[],
        location: "负责人登记",
      }))
    : staff
  const result: OutcomeSource = {
    ...(session.registration ? { registration: session.registration } : {}),
    taskId,
    taskVersion: task.version,
    sourceVersion: session.sourceVersion,
    projectId: task.projectId,
    teamId: task.teamId,
    title: task.title,
    address: session.snapshot.address,
    regionPathSnapshot: session.snapshot.regionPathSnapshot,
    date,
    form: task.form,
    state: session.status,
    leaderId: task.leaderId,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt.toISOString(),
    summary,
    staff: registeredStaff,
    participants: registeredPeople,
    issues: session.registration ? [] : issues,
    rules,
    evidence: data.executions.evidence
      .filter((f) => f.taskId === taskId && !f.deletedAt && f.boundKind)
      .map((f) => ({
        id: f.id,
        name: f.name,
        sha256: f.sha256,
        size: f.size,
        contentType: f.contentType,
      })),
  }
  if (result.registration)
    for (const rule of result.rules)
      rule.registeredValue = calculateOutcome(
        result,
        rule.mode,
        [],
        rule.manualValue,
        false,
        rule.indicatorId,
      ).value
  return result
}
