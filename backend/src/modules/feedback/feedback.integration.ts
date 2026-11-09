import { ResourceRepository } from "@/modules/resource/resource.repository"
import { syncContractCooperation } from "@/modules/resource/resource.service"
import { CooperationEvaluationService } from "@/modules/resource/resource.evaluation"
import { beforeAll, describe, test, expect } from "bun:test"
import { eq } from "drizzle-orm"
import * as s from "@/db/schema"
import type { Database } from "@/modules/identity/identity.repository"
import { IdentityRepository } from "@/modules/identity/identity.repository"
import { IdentityService } from "@/modules/identity/identity.service"
import { businessDate, nextDay } from "@/modules/task/task-calendar"
import { grantFeedbackPermissions } from "./feedback.seed"
import { FeedbackRepository } from "./feedback.repository"
import { FeedbackService } from "./feedback.service"
import type { Actor } from "@/utils/authorization"
export function registerFeedbackTests(
  context: () => { database: Database; handle: (r: Request) => Response | Promise<Response> },
) {
  describe("B6质量反馈、合作评价与改进", () => {
    let social = "",
      manager = "",
      other = "",
      admin = "",
      socialId = 0,
      resourceId = 0,
      manual = 0,
      contract = 0
    const ids: number[] = [],
      key = () => crypto.randomUUID(),
      today = businessDate(),
      day = nextDay(today, -1)
    const base = (id: number) => `/service/tasks/${id}/feedback`
    async function request(path: string, method = "GET", token = social, body?: unknown) {
      const r = await context().handle(
        new Request(`http://localhost/api${path}`, {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            ...(body ? { "content-type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      )
      return { ...(await r.json()), status: r.status }
    }
    async function good(path: string, method = "GET", token = social, body?: unknown) {
      const r = await request(path, method, token, body)
      if (r.code !== 0) throw new Error(`${path}: ${JSON.stringify(r)}`)
      expect(r.code).toBe(0)
      return r.data
    }
    const input = (satisfiedCount = 8, neutralCount = 2) => ({
      version: 0,
      requestKey: key(),
      satisfiedCount,
      neutralCount,
      dissatisfiedCount: 0,
      source: "PAPER",
      sourceNote: "",
      feedbackDate: today,
      suggestions: "下次增加讨论",
    })
    beforeAll(async () => {
      const db = context().database
      await grantFeedbackPermissions(db, true)
      const login = async (username: string) =>
        (await good("/auth/login", "POST", "", { username, password: "IdentityTest_2026" }))
          .token as string
      social = await login("social")
      manager = await login("project_manager")
      other = await login("other_social")
      admin = await login("admin")
      const users = await db.select().from(s.users)
      socialId = users.find((u) => u.username === "social")!.id
      const tasks = await db.select().from(s.serviceTasks),
        sessions = await db.select().from(s.executionSessions)
      const original = tasks.find(
        (t) =>
          t.leaderId === socialId &&
          sessions.some((e) => e.taskId === t.id && e.status === "ENDED"),
      )!
      if (!original) throw new Error("缺少执行登记已完成样本")
      const originalSession = sessions.find((e) => e.taskId === original.id)!
      for (let i = 0; i < 3; i++) {
        const [r] = await db.insert(s.serviceTasks).values({
          ...original,
          id: undefined,
          title: `B6质量样本${i}`,
          requestKey: key(),
          batchIndex: 0,
          batchFingerprint: key(),
          executionMode: i === 1 ? "LEGACY" : "SIMPLE",
          form: "COLLECTIVE",
          status: "SCHEDULED",
        })
        ids.push(r.insertId)
        await db.insert(s.serviceTaskStaff).values({ taskId: r.insertId, userId: socialId })
        await db.insert(s.executionSessions).values({
          ...originalSession,
          id: undefined,
          taskId: r.insertId,
          status: "ENDED",
          startedAt: new Date(`${day}T09:00:00+08:00`),
          endedAt: new Date(`${day}T11:00:00+08:00`),
        })
      }
      const [r] = await db.insert(s.resources).values({
        name: "B6合作样本",
        normalizedName: "b6-quality",
        unitType: "企业",
        region: "深圳市",
        ownerOrgId: users.find((u) => u.username === "project_manager")!.orgId!,
        maintainerId: users.find((u) => u.username === "project_manager")!.id,
        createdBy: socialId,
      })
      resourceId = r.insertId
      for (const type of ["MANUAL", "CONTRACT"] as const) {
        const [c] = await db.insert(s.resourceCooperations).values({
          resourceId,
          title: `B6${type}`,
          type,
          projectId: original.projectId,
          ownerId: socialId,
          status: "AGREED",
          startDate: day,
          endDate: nextDay(today, 30),
          basis: "隔离样本",
          feedback: "历史反馈",
        })
        if (type === "MANUAL") manual = c.insertId
        else contract = c.insertId
      }
    })
    test("Q01/Q05创建、并发原请求重试、冲突、真实责任及旧版本", async () => {
      const body = input(),
        path = base(ids[0]!)
      const results = await Promise.all([
        good(path, "PUT", social, body),
        good(path, "PUT", social, body),
      ])
      expect(results[0].id).toBe(results[1].id)
      expect((await request(path, "PUT", social, { ...body, satisfiedCount: 9 })).code).toBe(4000)
      expect((await request(path, "PUT", social, { ...body, requestKey: key() })).code).toBe(4000)
      expect(
        (
          await request(path, "PUT", admin, {
            ...body,
            version: 1,
            requestKey: key(),
            reason: "管理员代填",
          })
        ).code,
      ).not.toBe(0)
      expect((await request(path, "GET", other)).code).not.toBe(0)
      expect((await good(path)).history).toHaveLength(1)
      expect(JSON.stringify((await good(path)).history)).not.toContain("requestKey")
      await good(base(ids[1]!), "PUT", social, input(15, 15))
      for (const change of [
        { satisfiedCount: 0, neutralCount: 0 },
        { satisfiedCount: -1 },
        { satisfiedCount: 100000 },
        { feedbackDate: nextDay(today, 1) },
        { feedbackDate: nextDay(day, -1) },
        { source: "OTHER" },
        { dissatisfiedCount: 1, suggestions: "" },
      ])
        expect(
          (await request(base(ids[2]!), "PUT", social, { ...input(), ...change })).code,
        ).not.toBe(0)
    })
    test("Q04同一筛选覆盖率、加权份数、明细及导出指纹", async () => {
      const report = await good(
        "/analysis/quality/service?keyword=B6质量样本&pageSize=100",
        "GET",
        manager,
      )
      expect(report.summary).toMatchObject({
        total: 3,
        evaluated: 2,
        coverage: "66.67",
        samples: 40,
        satisfaction: "57.50",
      })
      expect(
        (
          await good(
            `/analysis/quality/service/details?keyword=B6质量样本&fingerprint=${report.meta.fingerprint}`,
            "GET",
            manager,
          )
        ).total,
      ).toBe(3)
      expect((await request("/analysis/quality/service/details", "GET", manager)).code).toBe(1000)
      const response = await context().handle(
        new Request(
          `http://localhost/api/analysis/quality/service/export?keyword=B6质量样本&fingerprint=${report.meta.fingerprint}`,
          { headers: { authorization: `Bearer ${manager}` } },
        ),
      )
      expect(response.status).toBe(200)
      expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000)
      await good(base(ids[0]!) + "/void", "POST", social, {
        version: 1,
        requestKey: key(),
        reason: "样本重复",
      })
      expect(
        (
          await request(
            `/analysis/quality/service/details?keyword=B6质量样本&fingerprint=${report.meta.fingerprint}`,
            "GET",
            manager,
          )
        ).code,
      ).toBe(4000)
      expect(
        (await good("/analysis/quality/service?keyword=B6质量样本", "GET", manager)).summary
          .evaluated,
      ).toBe(1)
      await good(base(ids[0]!), "PUT", social, { ...input(), version: 2, reason: "重新核实恢复" })
    })
    test("Q02合同与手工独立评价、旧文本分母、原编辑兼容", async () => {
      const path = (id: number) => `/resources/${resourceId}/cooperations/${id}/evaluation`
      expect((await good(path(contract), "GET", manager)).cooperation.feedbackRating).toBeNull()
      expect(
        (await good(`/analysis/quality/cooperation?resourceId=${resourceId}`, "GET", manager))
          .summary,
      ).toMatchObject({ total: 2, evaluated: 0 })
      const body = {
        version: 1,
        requestKey: key(),
        feedbackRating: "NEEDS_IMPROVEMENT",
        result: "已履约",
        feedback: "需要提前沟通",
      }
      await good(path(contract), "PUT", manager, body)
      expect((await good(path(contract), "PUT", manager, body)).version).toBe(2)
      expect(
        (await request(path(contract), "PUT", social, { ...body, requestKey: key(), version: 2 }))
          .code,
      ).not.toBe(0)
      await good(path(manual), "PUT", manager, {
        ...body,
        requestKey: key(),
        feedbackRating: "SATISFIED",
      })
      expect(
        (await good(`/analysis/quality/cooperation?resourceId=${resourceId}`, "GET", manager))
          .summary,
      ).toMatchObject({ total: 2, evaluated: 2, coverage: "100.00" })
      expect(
        (await request(`/analysis/quality/cooperation?dateFrom=${day}`, "GET", manager)).code,
      ).toBe(1000)
      const c = (
        await context()
          .database.select()
          .from(s.resourceCooperations)
          .where(eq(s.resourceCooperations.id, contract))
      )[0]!
      expect(c.type).toBe("CONTRACT")
      expect(c.status).toBe("AGREED")
      expect(c.ownerId).toBe(socialId)
      expect(
        (
          await request(`/resources/${resourceId}/cooperations/${manual}`, "PUT", manager, {
            title: c.title,
            ownerId: socialId,
            status: "AGREED",
            startDate: day,
            endDate: c.endDate,
            basis: "隔离样本",
            result: "覆盖评价",
            feedback: "覆盖评价",
            version: 2,
          })
        ).code,
      ).toBe(4000)
    })
    test("Q02/Q05合同同步与资源合并保留独立评价和历史，评价故障回滚", async () => {
      const db = context().database,
        identity = new IdentityService(new IdentityRepository(db))
      const users = await db.select().from(s.users)
      const actor = await identity.actor(users.find((u) => u.username === "project_manager")!.id)
      const coop = (
        await db
          .select()
          .from(s.resourceCooperations)
          .where(eq(s.resourceCooperations.id, contract))
      )[0]!
      const baseContract = (await db.select().from(s.projectContracts)).find(
        (c) => c.projectId === coop.projectId,
      )!
      const syntheticId = 900000 + contract
      await db
        .update(s.resourceCooperations)
        .set({ contractId: syntheticId })
        .where(eq(s.resourceCooperations.id, contract))
      await new ResourceRepository(db).run(actor, true, async (tx) => {
        await syncContractCooperation(tx, actor, { ...baseContract, id: syntheticId, resourceId })
      })
      const after = (
        await good(`/resources/${resourceId}/cooperations/${contract}/evaluation`, "GET", manager)
      ).cooperation
      expect(after.feedbackRating).toBe("NEEDS_IMPROVEMENT")
      expect(after.feedbackBy).toBe(actor.user.id)
      expect(after.feedback).toBe("需要提前沟通")
      const real = new FeedbackRepository(db)
      const failing = {
        run: (who: Actor, write: boolean, work: Parameters<FeedbackRepository["run"]>[2]) =>
          real.run(who, write, (data, tx) =>
            work(data, {
              ...tx,
              audit: async () => {
                throw new Error("评价审计故障")
              },
            }),
          ),
      } as FeedbackRepository
      let failed = false
      try {
        await new CooperationEvaluationService(failing).save(actor, resourceId, contract, {
          version: after.version,
          requestKey: key(),
          feedbackRating: "GENERAL",
          result: "更正结果",
          feedback: "更正反馈",
          reason: "核实",
        })
      } catch (error) {
        failed = true
        expect((error as Error).message).toBe("评价审计故障")
      }
      expect(failed).toBe(true)
      expect(
        (await good(`/resources/${resourceId}/cooperations/${contract}/evaluation`, "GET", manager))
          .cooperation.version,
      ).toBe(after.version)
      const source = (await db.select().from(s.resources).where(eq(s.resources.id, resourceId)))[0]!
      const [target] = await db.insert(s.resources).values({
        ...source,
        id: undefined,
        name: "B6合作汇总",
        normalizedName: "b6-quality-target",
        requestKey: null,
      })
      const sourceId = resourceId
      await good("/resources/merge", "POST", admin, {
        sourceId,
        targetId: target.insertId,
        sourceVersion: source.version,
        targetVersion: source.version,
        reason: "隔离合并回归",
      })
      resourceId = target.insertId
      expect(
        (
          await request(
            `/resources/${sourceId}/cooperations/${contract}/evaluation`,
            "GET",
            manager,
          )
        ).code,
      ).toBe(3000)
      const detail = await good(
        `/resources/${resourceId}/cooperations/${contract}/evaluation`,
        "GET",
        manager,
      )
      expect(detail.cooperation.id).toBe(contract)
      expect(detail.cooperation.feedbackRating).toBe("NEEDS_IMPROVEMENT")
      expect(detail.history).toHaveLength(1)
    })
    test("Q03来源预填衔接B5跟进及后续任务回看", async () => {
      const candidates = await good("/management-followups/candidates", "GET", manager)
      const source = candidates.sources.find(
        (s: { sourceType: string; sourceId: number }) =>
          s.sourceType === "TASK" && s.sourceId === ids[0],
      )
      expect(source).toBeDefined()
      const f = await good("/management-followups", "POST", manager, {
        projectId: source.projectId,
        teamId: source.teamId,
        sourceType: "TASK",
        sourceId: ids[0],
        title: "B6改进",
        description: "完善沟通",
        ownerId: socialId,
        dueDate: today,
        requestKey: key(),
      })
      await good(`/management-followups/${f.id}/transition`, "POST", social, {
        action: "COMPLETE",
        note: "已完成讨论安排",
        version: 1,
        requestKey: key(),
      })
      expect((await good(base(ids[0]!), "GET", manager)).followups[0].result).toBe("已完成讨论安排")
      expect(
        (await good(base(ids[2]!), "GET", manager)).related.some(
          (r: { taskId: number; followups: unknown[] }) =>
            r.taskId === ids[0] && r.followups.length > 0,
        ),
      ).toBe(true)
      expect(
        (await good(`/management-followups?sourceType=TASK&sourceId=${ids[0]}`, "GET", manager))
          .total,
      ).toBe(1)
    })
    test("Q05审计失败回滚与资格变化、取消／中止／非集体拦截", async () => {
      const db = context().database,
        repository = new IdentityRepository(db),
        identity = new IdentityService(repository)
      const account = await repository.findUsername("social"),
        actor = await identity.actor(account!.id)
      const real = new FeedbackRepository(db)
      const failing = {
        run: (who: Actor, write: boolean, work: Parameters<FeedbackRepository["run"]>[2]) =>
          real.run(who, write, (data, tx) =>
            work(data, {
              ...tx,
              audit: async () => {
                throw new Error("模拟日志故障")
              },
            }),
          ),
      } as FeedbackRepository
      let failed = false
      try {
        await new FeedbackService(failing).save(
          actor,
          ids[2]!,
          input() as Parameters<FeedbackService["save"]>[2],
        )
      } catch (error) {
        failed = true
        expect((error as Error).message).toBe("模拟日志故障")
      }
      expect(failed).toBe(true)
      expect((await good(base(ids[2]!))).feedback).toBeNull()
      for (const values of [{ form: "HOME_VISIT" as const }, { status: "CANCELED" as const }]) {
        await db.update(s.serviceTasks).set(values).where(eq(s.serviceTasks.id, ids[2]!))
        expect((await request(base(ids[2]!), "PUT", social, input())).code).toBe(4000)
        await db
          .update(s.serviceTasks)
          .set({ form: "COLLECTIVE", status: "SCHEDULED" })
          .where(eq(s.serviceTasks.id, ids[2]!))
      }
      await db
        .update(s.executionSessions)
        .set({ status: "STOPPED" })
        .where(eq(s.executionSessions.taskId, ids[2]!))
      expect((await request(base(ids[2]!), "PUT", social, input())).code).toBe(4000)
      await db
        .update(s.executionSessions)
        .set({ status: "ENDED" })
        .where(eq(s.executionSessions.taskId, ids[2]!))
      const task = (
        await db.select().from(s.serviceTasks).where(eq(s.serviceTasks.id, ids[2]!))
      )[0]!
      const membership = (await db.select().from(s.projectMemberships)).find(
        (m) => m.userId === socialId && m.projectId === task.projectId,
      )!
      await db
        .update(s.projectMemberships)
        .set({ endDate: day })
        .where(eq(s.projectMemberships.id, membership.id))
      try {
        expect((await request(base(ids[2]!), "PUT", social, input())).code).toBe(2003)
      } finally {
        await db
          .update(s.projectMemberships)
          .set({ endDate: membership.endDate })
          .where(eq(s.projectMemberships.id, membership.id))
      }
      await db.update(s.users).set({ status: "DISABLED" }).where(eq(s.users.id, socialId))
      try {
        expect((await request(base(ids[2]!), "PUT", social, input())).code).not.toBe(0)
      } finally {
        await db.update(s.users).set({ status: "ACTIVE" }).where(eq(s.users.id, socialId))
      }
    })
  })
}
