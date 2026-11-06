import {
  ManagementRepository,
  type ManagementState,
  type ManagementWriter,
} from "./management.repository"
import { ManagementService } from "./management.service"
import { IdentityRepository } from "@/modules/identity/identity.repository"
import { IdentityService } from "@/modules/identity/identity.service"
import { calculateReport } from "@/modules/analysis/management.calculation"
import { nextDay } from "@/modules/task/task-calendar"
import type { Actor } from "@/utils/authorization"
import { beforeAll, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import ExcelJS from "exceljs"
import * as s from "@/db/schema"
import type { Database } from "@/modules/identity/identity.repository"
import { grantManagementPermissions } from "./management.seed"
import { businessDate } from "@/modules/task/task-calendar"
export function registerManagementTests(
  context: () => { database: Database; handle: (r: Request) => Response | Promise<Response> },
) {
  describe("B5管理分析与职责闭环", () => {
    let manager = "",
      social = "",
      other = "",
      admin = "",
      id = 0,
      source: { projectId: number; teamId: number; sourceId: number; sourceType: "PROJECT" },
      ownerId = 0
    const key = () => crypto.randomUUID()
    async function request(path: string, method = "GET", token = manager, body?: unknown) {
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
    async function good(path: string, method = "GET", token = manager, body?: unknown) {
      const r = await request(path, method, token, body)
      if (r.code !== 0) throw new Error(`${method} ${path}: ${JSON.stringify(r)}`)
      expect(r.code).toBe(0)
      return r.data
    }
    beforeAll(async () => {
      await grantManagementPermissions(context().database, true)
      const login = async (username: string) =>
        (await good("/auth/login", "POST", "", { username, password: "IdentityTest_2026" }))
          .token as string
      manager = await login("project_manager")
      social = await login("social")
      other = await login("other_social")
      admin = await login("admin")
      const users = await context().database.select().from(s.users),
        projects = await context().database.select().from(s.projects),
        teams = await context().database.select().from(s.projectTeams)
      ownerId = users.find((u) => u.username === "social")!.id
      const managerId = users.find((u) => u.username === "project_manager")!.id
      const own = projects.find(
        (p) =>
          p.directorId === managerId && !p.deletedAt && teams.some((t) => t.projectId === p.id),
      )!
      const team =
        teams.find(
          (t) =>
            t.projectId === own.id &&
            t.teamId === users.find((u) => u.username === "leader")!.orgId,
        ) ?? teams.find((t) => t.projectId === own.id)!
      source = { projectId: own.id, teamId: team.teamId, sourceId: own.id, sourceType: "PROJECT" }
      const candidates = await good("/management-followups/candidates")
      const selected = candidates.sources.find(
        (x: { sourceType: string; projectId: number; teamId: number; owners: { id: number }[] }) =>
          x.sourceType === "PROJECT" && x.teamId && x.owners.some((u) => u.id === ownerId),
      )
      if (!selected) throw new Error("Missing authorized management fixture")
      source = {
        projectId: selected.projectId,
        teamId: selected.teamId,
        sourceId: selected.sourceId,
        sourceType: "PROJECT",
      }
    })
    test("M01/M02报告正式量复用原进度，图表明细与Excel一致", async () => {
      const old = await good("/analysis/indicators?pageSize=100")
      const report = await good("/analysis/management/progress?pageSize=100")
      expect(report.total).toBe(old.total)
      for (const row of report.list) {
        const previous = old.list.find(
          (r: { indicatorId: number; teamId: number | null; statisticsScope: string }) =>
            `${r.statisticsScope}-${r.indicatorId}-${r.teamId ?? 0}` === row.key,
        )
        expect(row.cumulative).toBe(previous.cumulative)
      }
      expect(report.groups.reduce((n: number, g: { value: number }) => n + g.value, 0)).toBe(
        report.total,
      )
      const query = new URLSearchParams({
        fingerprint: report.meta.fingerprint,
        referenceTime: report.meta.referenceTime,
        asOfDate: report.meta.filters.asOfDate,
      })
      const response = await context().handle(
        new Request(`http://localhost/api/analysis/management/progress/export?${query}`, {
          headers: { authorization: `Bearer ${manager}` },
        }),
      )
      expect(response.status).toBe(200)
      const book = new ExcelJS.Workbook()
      await book.xlsx.load(await response.arrayBuffer())
      expect(book.getWorksheet("报告明细")!.rowCount - 1).toBe(report.total)
      for (const kind of ["tasks", "approvals", "resources"]) {
        const r = await good(`/analysis/management/${kind}?pageSize=100`)
        expect(r.groups.reduce((n: number, g: { value: number }) => n + g.value, 0)).toBe(r.total)
      }
      expect((await request("/analysis/management/resources?projectId=1")).code).toBe(1000)
      expect((await request("/analysis/management/tasks/export")).code).toBe(1000)
    })
    test("M04问题创建幂等、责任隔离及来源验证", async () => {
      const body = {
        ...source,
        title: "B5阶段协同问题",
        description: "核对阶段目标并协调服务安排",
        ownerId,
        dueDate: businessDate(),
        requestKey: key(),
      }
      const result = await good("/management-followups", "POST", manager, body)
      id = result.id
      expect((await good("/management-followups", "POST", manager, body)).id).toBe(id)
      expect(
        (await request("/management-followups", "POST", manager, { ...body, title: "不同内容" }))
          .code,
      ).toBe(4000)
      expect(
        (await request("/management-followups", "POST", social, { ...body, requestKey: key() }))
          .code,
      ).toBe(2003)
      expect(
        (
          await request("/management-followups", "POST", manager, {
            ...body,
            sourceId: 999999,
            requestKey: key(),
          })
        ).code,
      ).toBe(2003)
      expect((await request(`/management-followups/${id}`, "GET", other)).code).toBe(3000)
      const row = await good(`/management-followups/${id}`, "GET", social)
      expect(row.canProcess).toBe(true)
      expect(row.canManage).toBe(false)
      expect(
        (
          await request(`/management-followups/${id}/transition`, "POST", admin, {
            action: "COMPLETE",
            note: "代填",
            version: row.version,
            requestKey: key(),
          })
        ).code,
      ).not.toBe(0)
    })
    test("M04/M05原请求重试、并发旧版本、完成及重开留痕", async () => {
      let row = await good(`/management-followups/${id}`, "GET", social)
      const body = { action: "START", note: "已联系团队", version: row.version, requestKey: key() }
      await good(`/management-followups/${id}/transition`, "POST", social, body)
      await good(`/management-followups/${id}/transition`, "POST", social, body)
      expect(
        (
          await request(`/management-followups/${id}/transition`, "POST", social, {
            ...body,
            note: "重复键改内容",
          })
        ).code,
      ).toBe(4000)
      expect(
        (
          await request(`/management-followups/${id}/transition`, "POST", social, {
            ...body,
            action: "NOTE",
            requestKey: key(),
          })
        ).code,
      ).toBe(4000)
      row = await good(`/management-followups/${id}`, "GET", social)
      await good(`/management-followups/${id}/transition`, "POST", social, {
        action: "COMPLETE",
        note: "已完成目标核对与安排",
        version: row.version,
        requestKey: key(),
      })
      let dashboard = await good("/dashboard/overview", "GET", social)
      expect(
        dashboard.groups
          .find((g: { key: string }) => g.key === "management")
          .list.some((r: { key: string }) => r.key === `management-${id}`),
      ).toBe(false)
      row = await good(`/management-followups/${id}`)
      expect(row.events.filter((e: { action: string }) => e.action === "START")).toHaveLength(1)
      await good(`/management-followups/${id}/transition`, "POST", manager, {
        action: "REOPEN",
        note: "补充后续协调",
        version: row.version,
        requestKey: key(),
      })
      dashboard = await good("/dashboard/overview", "GET", social)
      expect(
        dashboard.groups
          .find((g: { key: string }) => g.key === "management")
          .list.some((r: { key: string }) => r.key === `management-${id}`),
      ).toBe(true)
    })
    test("M01阶段目标按截至日、已发布版本及完整范围计算", async () => {
      const repository = new ManagementRepository(context().database)
      const identities = new IdentityService(new IdentityRepository(context().database))
      const users = await context().database.select().from(s.users)
      const actor = await identities.actor(users.find((u) => u.username === "project_manager")!.id)
      await repository.run(actor, false, (data) => {
        const target = data.targets.find(
          (t) =>
            data.indicators.some(
              (i) => i.id === t.indicatorId && i.projectId === source.projectId,
            ) && t.teamId === source.teamId,
        )!
        const indicator = data.indicators.find((i) => i.id === target.indicatorId)!,
          today = businessDate(),
          planId = 999999
        const plan = {
          id: planId,
          projectId: source.projectId,
          targetId: target.id,
          revision: 99,
          mode: "MILESTONE" as const,
          status: "PUBLISHED" as const,
          effectiveDate: nextDay(today, -20),
          targetValue: target.targetValue,
          targetVersion: target.version,
          indicatorVersion: indicator.version,
          reason: "隔离计算样本",
          createdBy: actor.user.id,
          publishedBy: actor.user.id,
          publishedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1,
        }
        const sample = {
          ...data,
          scheduling: {
            ...data.scheduling,
            plans: [plan],
            periods: [
              {
                id: 1,
                planId,
                sequence: 1,
                startDate: nextDay(today, -20),
                endDate: nextDay(today, -1),
                targetValue: "7.25",
              },
              {
                id: 2,
                planId,
                sequence: 2,
                startDate: today,
                endDate: nextDay(today, 20),
                targetValue: "10.75",
              },
            ],
          },
        }
        const q = { projectId: source.projectId, teamId: source.teamId, indicatorId: indicator.id }
        let report = calculateReport(sample, actor, "progress", q)
        expect(report.rows[0]!.expected).toBe("7.25")
        expect(report.rows[0]!.currentTarget).toBe("10.75")
        sample.scheduling.plans = [{ ...plan, targetVersion: target.version + 1 }]
        report = calculateReport(sample, actor, "progress", q)
        expect(report.rows[0]!.expected).toBeNull()
        expect(report.rows[0]!.status).toBe("计划待调整")
        sample.scheduling.plans = []
        expect(calculateReport(sample, actor, "progress", q).rows[0]!.status).toBe("计划待制定")
      })
    })
    test("M04并发创建幂等，事件中途失败回滚主表与日志", async () => {
      const body = {
        ...source,
        title: "并发协调问题",
        description: "同一请求仅建立一条",
        ownerId,
        dueDate: businessDate(),
        requestKey: key(),
      }

      const results = await Promise.all([
        good("/management-followups", "POST", manager, body),
        good("/management-followups", "POST", manager, body),
      ])

      expect(results[0].id).toBe(results[1].id)
      const database = context().database,
        identities = new IdentityService(new IdentityRepository(database)),
        users = await database.select().from(s.users)
      const actor = await identities.actor(users.find((u) => u.username === "project_manager")!.id)
      class FailingRepository extends ManagementRepository {
        override run<T>(
          who: Actor,
          write: boolean,
          work: (data: ManagementState, writer: ManagementWriter) => Promise<T> | T,
        ): Promise<T> {
          return super.run(who, write, (data, writer) =>
            work(data, {
              ...writer,
              event: () => {
                throw new Error("injected B5 event failure")
              },
            }),
          )
        }
      }
      const requestKey = key(),
        before = (await database.select().from(s.managementFollowups)).length,
        audits = (await database.select().from(s.auditLogs)).length

      let message = ""
      try {
        await new ManagementService(new FailingRepository(database)).create(actor, {
          ...body,
          requestKey,
        })
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      expect(message).toBe("injected B5 event failure")

      expect((await database.select().from(s.managementFollowups)).length).toBe(before)
      expect((await database.select().from(s.auditLogs)).length).toBe(audits)
      expect(
        (await database.select().from(s.managementFollowupEvents)).some(
          (e) => e.requestKey === requestKey,
        ),
      ).toBe(false)
    })
    test("M06来源／权限变化拒绝旧报表导出", async () => {
      const report = await good("/analysis/management/tasks")
      const task = (await context().database.select().from(s.serviceTasks)).find((t) =>
        report.list.some((r: { key: string }) => r.key === `task-${t.id}`),
      )
      if (task) {
        await context()
          .database.update(s.serviceTasks)
          .set({ version: task.version + 1 })
          .where(eq(s.serviceTasks.id, task.id))
        const query = new URLSearchParams({
          fingerprint: report.meta.fingerprint,
          referenceTime: report.meta.referenceTime,
        })
        expect((await request(`/analysis/management/tasks/details?${query}`)).code).toBe(4000)
        await context()
          .database.update(s.serviceTasks)
          .set({ version: task.version, updatedAt: task.updatedAt })
          .where(eq(s.serviceTasks.id, task.id))
      }
      const report2 = await good("/analysis/management/approvals")
      const q = new URLSearchParams({
        fingerprint: report2.meta.fingerprint,
        referenceTime: new Date(Date.parse(report2.meta.referenceTime) - 1000).toISOString(),
      })
      expect((await request(`/analysis/management/approvals/details?${q}`)).code).toBe(4000)
    })
  })
}
