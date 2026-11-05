import { env } from "@/utils/env"
import { beforeAll, describe, expect, test } from "bun:test"
import { and, eq } from "drizzle-orm"
import * as s from "@/db/schema"
import { businessDate, nextDay } from "@/modules/task/task-calendar"
import {
  ProjectRepository,
  type BusinessConnection,
  type BusinessState,
} from "@/modules/project/project.repository"
import { IdentityRepository, type Database } from "@/modules/identity/identity.repository"
import { IdentityService } from "@/modules/identity/identity.service"
import type { Actor } from "@/utils/authorization"
import { RegistrationService } from "./registration.service"
import type { RegistrationInput } from "./registration.validation"

export function registerRegistrationTests(
  context: () => {
    database: Database
    handle: (r: Request) => Response | Promise<Response>
    setClock: (at: Date) => void
  },
) {
  describe("ER普通执行登记", () => {
    const today = businessDate(),
      end = nextDay(today, 60),
      clock = new Date(`${today}T16:00:00+08:00`)
    let social = "",
      manager = "",
      leader = "",
      other = "",
      admin = "",
      projectId = 0,
      teamId = 0,
      socialId = 0,
      first = 0,
      evidenceId = 0
    const ids: number[] = [],
      people: number[] = []
    const key = () => crypto.randomUUID(),
      base = (id: number) => `/service/tasks/${id}/registration`,
      out = (id: number) => `/service/tasks/${id}/outcome`
    async function request(path: string, method = "GET", token = social, body?: unknown) {
      const response = await context().handle(
        new Request(`http://localhost/api${path}`, {
          method,
          headers: {
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...(body ? { "content-type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      )
      return { status: response.status, ...(await response.json()) }
    }
    async function good(path: string, method = "GET", token = social, body?: unknown) {
      const r = await request(path, method, token, body)
      if (r.code !== 0) throw new Error(`${method} ${path}: ${JSON.stringify(r)}`)
      expect(r.code).toBe(0)
      return r.data
    }
    async function create(indicatorIds = ids, pid = projectId, sourceId?: number) {
      const body = {
        projectId: pid,
        teamId,
        title: `ER普通任务${key()}`,
        form: "COLLECTIVE",
        kind: indicatorIds.length ? "INDICATOR" : "OTHER",
        pointId: null,
        location: "虚构服务室",
        address: "隔离测试路1号",
        regionCode: "440304",
        startAt: `${today}T09:00:00+08:00`,
        endAt: `${today}T11:00:00+08:00`,
        leaderId: socialId,
        staffIds: [socialId],
        expectedPeople: 20,
        description: "普通执行登记",
        evidence: "业务依据",
        indicators: indicatorIds.map((indicatorId) => ({ indicatorId, plannedValue: "1" })),
        resources: [],
      }
      const preview = await good("/service/tasks/preview", "POST", manager, body)
      return (
        await good(
          sourceId ? `/service/tasks/${sourceId}/copy` : "/service/tasks",
          "POST",
          manager,
          {
            ...body,
            requestKey: key(),
            previewToken: preview.previewToken,
            conflictReason: "隔离数据并行样本",
          },
        )
      ).id as number
    }
    async function input(id: number): Promise<RegistrationInput> {
      const d = await good(base(id))
      return {
        taskVersion: d.taskVersion,
        sourceVersion: d.sourceVersion,
        outcomeVersion: d.outcomeVersion,
        requestKey: key(),
        startAt: `${today}T09:00:00+08:00`,
        endAt: `${today}T11:00:00+08:00`,
        summary: "ER执行结果总结",
        evidenceIds: id === first ? [evidenceId] : [],
        indicators: d.rules.map((r: { indicatorId: number; mode: string }) => ({
          indicatorId: r.indicatorId,
          value:
            r.mode === "VISITS"
              ? r.indicatorId === ids[2]
                ? "3"
                : "20"
              : r.mode === "MANUAL"
                ? "2.50"
                : "0",
          participantIds: r.mode === "PEOPLE" ? people : [],
          intervals:
            r.mode === "STAFF_HOURS"
              ? [
                  {
                    userId: socialId,
                    startAt: `${today}T09:00:00+08:00`,
                    endAt: `${today}T10:00:00+08:00`,
                  },
                  {
                    userId: socialId,
                    startAt: `${today}T09:30:00+08:00`,
                    endAt: `${today}T11:00:00+08:00`,
                  },
                ]
              : [],
        })),
      }
    }
    async function submit(id: number) {
      const d = await good(out(id))
      const body = {
        version: d.outcome.version,
        sourceVersion: d.sourceVersion,
        recordIds: d.records
          .filter(
            (r: { record: { status: string; submittedAt: string | null } }) =>
              ["DRAFT", "REJECTED"].includes(r.record.status) && !r.record.submittedAt,
          )
          .map((r: { recordId: number }) => r.recordId),
        requestKey: key(),
      }
      const result = await good(`${out(id)}/submit`, "POST", social, body)
      expect((await good(`${out(id)}/submit`, "POST", social, body)).replayed).toBe(true)
      return result.instanceIds as number[]
    }
    async function decide(instanceId: number, approve = true) {
      const row = (await good("/approvals/tasks?pageSize=100", "GET", leader)).list.find(
        (t: { instanceId: number }) => t.instanceId === instanceId,
      )
      const body = { version: row.version, decisions: [], comment: "核对实际登记" }
      if (!approve) return good(`/approvals/tasks/${row.id}/reject`, "POST", leader, body)
      const p = await good(`/approvals/tasks/${row.id}/outcome-preview`, "POST", leader, body)
      expect(p.source.issues).toHaveLength(0)
      return good(`/approvals/tasks/${row.id}/approve`, "POST", leader, {
        ...body,
        previewToken: p.previewToken,
      })
    }
    beforeAll(async () => {
      context().setClock(clock)
      const login = async (username: string) =>
        (await good("/auth/login", "POST", "", { username, password: "IdentityTest_2026" }))
          .token as string
      social = await login("social")
      manager = await login("project_manager")
      leader = await login("leader")
      other = await login("other_social")
      admin = await login("admin")
      const db = context().database,
        users = await db.select().from(s.users),
        m = users.find((u) => u.username === "project_manager")!,
        senior = users.find((u) => u.username === "supervisor")!,
        l = users.find((u) => u.username === "leader")!
      socialId = users.find((u) => u.username === "social")!.id
      teamId = l.orgId!
      const orgs = await db.select().from(s.organizations)
      teamId = orgs.find((o) => o.code === "demo-team-a")!.id
      const contractStart = nextDay(today, -40)
      const [p] = await db.insert(s.projects).values({
        code: "er-integration",
        name: "ER普通登记项目",
        ownerOrgId: m.orgId!,
        directorId: m.id,
        seniorDirectorId: senior.id,
        serviceFieldCode: "社区建设",
        status: "ACTIVE",
        createdBy: m.id,
      })
      projectId = p.insertId
      await db.insert(s.projectContracts).values({
        projectId,
        partnerName: "虚构单位",
        startDate: contractStart,
        endDate: end,
        amount: "100",
        serviceArea: "福田区",
        regionCode: "440304",
      })
      await db.insert(s.projectTeams).values({ projectId, teamId, reporterId: l.id })
      await db.insert(s.projectMemberships).values(
        [socialId, l.id].map((userId) => ({
          projectId,
          teamId,
          userId,
          startDate: contractStart,
          endDate: end,
        })),
      )
      for (const [mode, unit] of [
        ["SCENES", "场"],
        ["VISITS", "人次"],
        ["VISITS", "人次"],
        ["PEOPLE", "人"],
        ["STAFF_HOURS", "小时"],
        ["MANUAL", "份"],
      ] as const) {
        const [i] = await db.insert(s.projectIndicators).values({
          projectId,
          name: `ER${mode}${ids.length}`,
          unit,
          definition: "普通登记独立指标",
          targetValue: "1000",
          status: "ACTIVE",
        })
        ids.push(i.insertId)
        const [target] = await db
          .insert(s.teamIndicatorTargets)
          .values({ indicatorId: i.insertId, teamId, targetValue: "1000" })
        await db.insert(s.indicatorCalculationRules).values({
          indicatorId: i.insertId,
          mode,
          effectiveDate: contractStart,
          revision: 1,
          reason: "隔离口径",
          createdBy: m.id,
        })
        const plan = await good("/service/plans", "POST", manager, {
          targetId: target.insertId,
          mode: "MILESTONE",
          effectiveDate: today,
          reason: "ER阶段计划",
          periods: [{ startDate: contractStart, endDate: end, targetValue: "1000" }],
        })
        await good(`/service/plans/${plan.id}/publish`, "POST", manager, {
          version: (await good(`/service/plans/${plan.id}`, "GET", manager)).version,
        })
      }
      first = await create()
      for (let i = 0; i < 2; i++)
        people.push(
          (
            await good("/service/participants", "POST", social, {
              taskId: first,
              projectId,
              name: `ER对象${i}`,
              requestKey: key(),
            })
          ).id,
        )
      const body = new FormData()
      body.append("file", new File(["%PDF-1.4\nER\n%%EOF"], "测试依据.pdf"))
      body.append("requestKey", key())
      const response = await context().handle(
        new Request(`http://localhost/api${out(first)}/evidence`, {
          method: "POST",
          headers: { authorization: `Bearer ${social}` },
          body,
        }),
      )
      const uploaded = await response.json()
      expect(uploaded.code).toBe(0)
      evidenceId = uploaded.data.id
    }, 30000)
    test("ER01直接登记权限、非法依据与无旧现场前置", async () => {
      expect((await good(`/service/tasks/${first}`)).executionMode).toBe("SIMPLE")
      const body = await input(first)
      expect((await request(base(first), "PUT", manager, body)).status).toBe(403)
      expect((await request(base(first), "PUT", admin, body)).status).toBe(404)
      expect((await request(base(first), "GET", other)).status).toBe(404)
      expect(
        (
          await request(`/service/tasks/${first}/execution/start`, "POST", social, {
            sourceVersion: 0,
            requestKey: key(),
            declaredAt: clock.toISOString(),
            geo: { status: "NOT_REQUESTED" },
            reason: "",
            evidenceIds: [],
          })
        ).status,
      ).toBe(409)
      expect(
        (
          await request(`/service/tasks/${first}/execution/participants`, "POST", social, {
            participantId: people[0],
          })
        ).status,
      ).toBe(409)
      expect((await request(out(first), "POST")).status).toBe(409)
      for (const change of [
        { endAt: `${today}T17:00:00+08:00` },
        { endAt: body.startAt },
        { indicators: body.indicators.slice(1) },
        { indicators: body.indicators.map((r, i) => (i === 1 ? { ...r, value: "0.50" } : r)) },
        {
          indicators: body.indicators.map((r, i) =>
            i === 3 ? { ...r, participantIds: [999999] } : r,
          ),
        },
        {
          indicators: body.indicators.map((r, i) =>
            i === 4
              ? {
                  ...r,
                  intervals: [
                    { userId: socialId, startAt: `${today}T08:00:00+08:00`, endAt: body.endAt },
                  ],
                }
              : r,
          ),
        },
        { evidenceIds: [999999] },
      ])
        expect(
          (await request(base(first), "PUT", social, { ...body, ...change, requestKey: key() }))
            .code,
        ).not.toBe(0)
      expect(
        await context()
          .database.select()
          .from(s.executionSessions)
          .where(eq(s.executionSessions.taskId, first)),
      ).toHaveLength(0)
    })
    test("ER02一次登记六指标分别计算，重复／迟到请求不重复写入", async () => {
      const body = await input(first)
      const results = await Promise.all([
        request(base(first), "PUT", social, body),
        request(base(first), "PUT", social, body),
      ])
      expect(results.map((r) => r.code)).toEqual([0, 0])
      expect(results.some((r) => r.data.replayed)).toBe(true)
      const d = await good(out(first))
      expect(
        d.records.map((r: { record: { actualValue: string } }) => r.record.actualValue),
      ).toEqual(["1.00", "20.00", "3.00", "2.00", "2.00", "2.50"])
      expect(d.source.issues).toHaveLength(0)
      expect(d.source.registration.schemaVersion).toBe(1)
      expect(
        (await request(base(first), "PUT", social, { ...body, summary: "相同标识不同内容" }))
          .status,
      ).toBe(409)
      const changed = await input(first)
      changed.summary = "第二次登记"
      await good(base(first), "PUT", social, changed)
      expect((await good(base(first), "PUT", social, body)).replayed).toBe(true)
      expect((await good(base(first))).summary).toBe("第二次登记")
      expect(
        (await request(base(first), "PUT", social, { ...body, requestKey: key() })).status,
      ).toBe(409)
      expect((await good(out(first))).records).toHaveLength(6)
    })
    test("ER03提交与主管审批，在审保护及正式量", async () => {
      const instances = await submit(first)
      expect(instances).toHaveLength(6)
      expect((await request(base(first), "PUT", social, await input(first))).status).toBe(409)
      for (const instance of instances) await decide(instance)
      const d = await good(out(first))
      expect(
        d.records.every((r: { record: { status: string } }) => r.record.status === "SUBMITTED"),
      ).toBe(true)
      expect((await good(base(first))).state).toBe("COMPLETED")
    })
    test("ER04退回重提与撤回，指标外总结共用原审批", async () => {
      const id = await create([ids[1]!])
      await good(base(id), "PUT", social, await input(id))
      const [instance] = await submit(id)
      await decide(instance!, false)
      let body = await input(id)
      body.indicators[0]!.value = "9"
      await good(base(id), "PUT", social, body)
      const [again] = await submit(id)
      const d = await good(out(id))
      await good(`/service/records/${d.records[0].recordId}/withdraw`, "POST", social, {
        version: d.records[0].record.version,
      })
      body = await input(id)
      await good(base(id), "PUT", social, body)
      for (const i of await submit(id)) await decide(i)
      expect(again).toBeGreaterThan(instance!)
      const outside = await create([])
      await good(base(outside), "PUT", social, await input(outside))
      expect((await good(out(outside))).records).toHaveLength(0)
      const [summary] = await submit(outside)
      await decide(summary!)
      expect((await good(base(outside))).state).toBe("COMPLETED")
    })
    test("ER05更正／撤销／恢复，旧批准量持续到新批准", async () => {
      let d = await good(out(first))
      const record = d.records.find((r: { indicatorId: number }) => r.indicatorId === ids[1])
      const body = await input(first)
      body.reason = "修正统计登记"
      body.indicators.find((r) => r.indicatorId === ids[1])!.value = "23"
      await good(base(first), "PUT", social, body)
      expect(
        (await good(out(first))).records.find(
          (r: { indicatorId: number }) => r.indicatorId === ids[1],
        ).record.actualValue,
      ).toBe("20.00")
      for (const operation of ["CORRECT", "DELETE", "RESTORE"]) {
        d = await good(out(first))
        const row = d.records.find((r: { recordId: number }) => r.recordId === record.recordId)
        const change = await good(
          `/service/records/${row.recordId}/change-requests`,
          "POST",
          social,
          { operation, version: row.record.version, reason: "ER变更核对" },
        )
        await decide(change.instanceId)
        const latest = (await good(out(first))).records.find(
          (r: { recordId: number }) => r.recordId === record.recordId,
        ).record
        expect(latest.status).toBe(operation === "DELETE" ? "VOID" : "SUBMITTED")
        if (operation !== "DELETE") expect(latest.actualValue).toBe("23.00")
      }
    })
    test("ER06中途故障回滚会话／草稿／快照，新旧读写分流", async () => {
      const id = await create([ids[1]!]),
        body = await input(id),
        db = context().database
      class FailingRepository extends ProjectRepository {
        override write<T>(
          actor: Actor,
          work: (tx: BusinessConnection, data: BusinessState, current: Actor) => Promise<T>,
        ): Promise<T> {
          return super.write(actor, (tx, data, current) =>
            work(
              {
                ...tx,
                outcomes: {
                  ...tx.outcomes,
                  snapshots: {
                    insert: async () => {
                      throw new Error("ER注入故障")
                    },
                  },
                },
              },
              data,
              current,
            ),
          )
        }
      }
      const user = (await db.select().from(s.users).where(eq(s.users.id, socialId)))[0]!,
        actor = await new IdentityService(new IdentityRepository(db)).actor(user.id)
      const result = await new RegistrationService(new FailingRepository(db), () => clock)
        .save(actor, id, body)
        .then(
          () => null,
          (e: Error) => e,
        )
      expect(result?.message).toContain("失败")
      expect(
        await db.select().from(s.executionSessions).where(eq(s.executionSessions.taskId, id)),
      ).toHaveLength(0)
      expect(
        await db.select().from(s.taskOutcomes).where(eq(s.taskOutcomes.taskId, id)),
      ).toHaveLength(0)
      const old = (await db.select().from(s.serviceTasks)).find(
        (t) => t.executionMode === "LEGACY" && t.title.startsWith("B4服务"),
      )!
      expect((await request(base(old.id), "GET", manager)).status).toBe(409)
      expect((await good(`/service/tasks/${id}`)).executionMode).toBe("SIMPLE")
    })
    test("ER07新旧任务共用对象及人员，集合去重／时段并集不重复累计", async () => {
      const db = context().database,
        oldProject = (await db.select().from(s.projects)).find((p) => p.code === "b4-integration")!
      const oldIndicators = (await db.select().from(s.projectIndicators)).filter(
        (i) => i.projectId === oldProject.id,
      )
      const personIndicator = oldIndicators.find((i) => i.name === "B4PEOPLE")!,
        hourIndicator = oldIndicators.find((i) => i.name === "B4STAFF_HOURS")!
      const links = await db.select().from(s.outcomeRecordLinks),
        reviews = await db.select().from(s.outcomeReviews),
        reports = await db.select().from(s.monthlyReports)
      const active = (indicatorId: number) =>
        links
          .filter(
            (l) =>
              l.indicatorId === indicatorId &&
              reports.some((r) => r.id === l.recordId && r.status === "SUBMITTED"),
          )
          .map((l) => reviews.find((r) => r.id === l.effectiveReviewId)!)
          .filter(Boolean)
      const person = active(personIndicator.id).flatMap((r) => r.measure.people)[0]!,
        interval = active(hourIndicator.id)
          .flatMap((r) => r.measure.intervals)
          .find((i) => i.userId === socialId)!
      expect(person).toBeGreaterThan(0)
      expect(interval).toBeDefined()
      const progress = async () =>
        (
          await good(
            `/service/indicator-progress?projectId=${oldProject.id}&pageSize=100`,
            "GET",
            manager,
          )
        ).list
          .filter((r: { statisticsScope: string }) => r.statisticsScope === "PROJECT")
          .filter((r: { indicatorId: number }) =>
            [personIndicator.id, hourIndicator.id].includes(r.indicatorId),
          )
          .map((r: { indicatorId: number; cumulative: string; monthlyValue: string }) => ({
            id: r.indicatorId,
            cumulative: r.cumulative,
            monthly: r.monthlyValue,
          }))
      const before = await progress(),
        id = await create([personIndicator.id, hourIndicator.id], oldProject.id),
        body = await input(id)
      body.startAt = interval.startAt
      body.endAt = interval.endAt
      for (const metric of body.indicators) {
        metric.participantIds = metric.indicatorId === personIndicator.id ? [person] : []
        metric.intervals = metric.indicatorId === hourIndicator.id ? [interval] : []
      }
      await good(base(id), "PUT", social, body)
      for (const instance of await submit(id)) await decide(instance)
      expect(await progress()).toEqual(before)
    })
    test("ER08实际日期跨月更正，旧月保留至批准后移入新月", async () => {
      const id = await create([ids[1]!])
      await good(base(id), "PUT", social, await input(id))
      for (const i of await submit(id)) await decide(i)
      const d = await good(out(id)),
        previousMonth = nextDay(today, -new Date(today + "T00:00:00Z").getUTCDate()),
        body = await input(id)
      body.startAt = previousMonth + "T09:00:00+08:00"
      body.endAt = previousMonth + "T11:00:00+08:00"
      body.reason = "实际日期跨月核对"
      await good(base(id), "PUT", social, body)
      expect((await good(out(id))).records[0].record.serviceDate).toBe(today)
      const change = await good(
        `/service/records/${d.records[0].recordId}/change-requests`,
        "POST",
        social,
        { operation: "CORRECT", version: d.records[0].record.version, reason: "实际日期核对" },
      )
      await decide(change.instanceId)
      const after = (await good(out(id))).records[0].record
      expect(after.serviceDate).toBe(previousMonth)
      expect(after.month).toBe(previousMonth.slice(0, 7))
    })
    test("ER09实际资格、非分派工时与开发超管边界，复制旧任务采用新登记", async () => {
      const db = context().database,
        id = await create([ids[1]!]),
        body = await input(id)
      const prior = { nodeEnv: env.nodeEnv, devSuperadminUsername: env.devSuperadminUsername }
      try {
        Object.assign(env, { nodeEnv: "development", devSuperadminUsername: "admin" })
        expect((await request(base(id), "PUT", admin, body)).status).toBe(403)
      } finally {
        Object.assign(env, prior)
      }
      const membership = (await db.select().from(s.projectMemberships)).find(
        (m) => m.projectId === projectId && m.userId === socialId,
      )!
      await db
        .update(s.projectMemberships)
        .set({ endDate: nextDay(today, -1) })
        .where(eq(s.projectMemberships.id, membership.id))
      try {
        expect((await request(base(id), "PUT", social, body)).status).toBe(403)
      } finally {
        await db
          .update(s.projectMemberships)
          .set({ endDate: membership.endDate })
          .where(
            and(
              eq(s.projectMemberships.id, membership.id),
              eq(s.projectMemberships.userId, socialId),
            ),
          )
      }
      expect(
        (await request(base(id), "PUT", social, { ...body, evidenceIds: [evidenceId] })).status,
      ).toBe(403)
      const hourTask = await create([ids[4]!]),
        hours = await input(hourTask),
        managerId = (await db.select().from(s.users)).find(
          (u) => u.username === "project_manager",
        )!.id
      hours.indicators[0]!.intervals[0]!.userId = managerId
      expect((await request(base(hourTask), "PUT", social, hours)).status).toBe(403)
      await db
        .update(s.serviceTasks)
        .set({ executionMode: "LEGACY" })
        .where(eq(s.serviceTasks.id, id))
      const copied = await create([ids[1]!], projectId, id)
      expect((await good(`/service/tasks/${copied}`)).executionMode).toBe("SIMPLE")
      expect((await good(`/service/tasks/${id}`)).executionMode).toBe("LEGACY")
    })
  })
}
