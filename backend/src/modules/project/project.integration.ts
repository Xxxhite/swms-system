import { beforeAll, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import ExcelJS from "exceljs"
import * as s from "@/db/schema"
import type { Database } from "@/modules/identity/identity.repository"
import { businessToday, subtractMonths } from "@/modules/service/indicator-calculation"
import { seedIdentity } from "@/modules/identity/identity.seed.repository"
/** 在身份套件的同一个独立库初始化后注册业务场景，避免多个测试文件并发清库。 */
export function registerProjectTests(
  context: () => { database: Database; handle: (r: Request) => Response | Promise<Response> },
) {
  describe("第二阶段项目指标", () => {
    let admin = "",
      social = "",
      other = "",
      leader = "",
      department = "",
      projectId = 0,
      indicatorId = 0,
      teamA = 0,
      teamB = 0,
      reportId = 0,
      changeId = 0,
      taskId = 0
    const month = businessToday().slice(0, 7)
    /** 使用真实应用链路，文件导出保留原始响应供回读。 */
    async function raw(path: string, method = "GET", token = admin, body?: unknown) {
      return context().handle(
        new Request(`http://localhost/api${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { "content-type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      )
    }
    async function request(path: string, method = "GET", token = admin, body?: unknown) {
      const r = await raw(path, method, token, body)
      const result = await r.json()
      return { status: r.status, ...result }
    }
    async function login(username: string) {
      const r = await request("/auth/login", "POST", "", {
        username,
        password: "IdentityTest_2026",
      })
      expect(r.code).toBe(0)
      return r.data.token as string
    }
    async function project() {
      return (await request(`/projects/${projectId}`)).data
    }
    async function indicator() {
      return (await project()).indicators.find((i: { id: number }) => i.id === indicatorId)
    }
    async function report() {
      return (await request(`/service/monthly-reports/${reportId}`)).data
    }
    beforeAll(async () => {
      admin = await login("admin")
      social = await login("social")
      other = await login("other_social")
      leader = await login("leader")
      department = await login("department")
      const orgs = await context().database.select().from(s.organizations)
      teamA = orgs.find((o) => o.code === "demo-team-a")!.id
      teamB = orgs.find((o) => o.code === "demo-team-b")!.id
    })
    test("业务字段异常返回具体中文提示且不写入数据", async () => {
      const projectInput = {
        code: "validation-only",
        name: "校验项目",
        category: "CONTRACT_PACKAGE",
        ownerOrgId: 1,
        directorId: 1,
        supervisorId: 1,
        serviceFieldCode: "社区建设",
      }
      const cases: Array<[string, string, unknown, string]> = []
      for (const [field, value, message] of [
        ["code", "bad code", "项目编码"],
        ["name", "  ", "项目名称"],
        ["category", "UNKNOWN", "项目分类"],
        ["ownerOrgId", 0, "归属组织"],
        ["directorId", 0, "项目总监"],
        ["supervisorId", 0, "督导"],
        ["serviceFieldCode", "", "主服务领域"],
      ] as const)
        cases.push(["/projects", "POST", { ...projectInput, [field]: value }, message])
      const contract = {
        version: 1,
        partnerName: "合作单位",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        amount: "0.00",
        serviceArea: "测试区",
      }
      for (const [field, value, message] of [
        ["partnerName", " ", "合作方"],
        ["startDate", "2026-13-01", "开始日期"],
        ["endDate", "", "结束日期"],
        ["amount", "-1", "合同金额"],
        ["serviceArea", "", "服务区域"],
      ] as const)
        cases.push(["/projects/1/contract", "PUT", { ...contract, [field]: value }, message])
      cases.push([
        "/projects/1/indicators",
        "POST",
        { name: "", unit: "人次", definition: "统计说明", targetValue: "1" },
        "指标名称",
      ])
      cases.push([
        "/service/monthly-reports",
        "POST",
        { indicatorId: 1, teamId: 1, month: "2026-13", actualValue: "0" },
        "填报月份",
      ])
      cases.push([
        "/service/monthly-reports",
        "POST",
        { indicatorId: 1, teamId: 1, month: "2026-10", actualValue: "1.001" },
        "数量",
      ])
      cases.push([
        "/service/monthly-reports/1/change-requests",
        "POST",
        { version: 1, operation: "DELETE", reason: "  " },
        "变更原因",
      ])
      for (const [path, method, body, message] of cases) {
        const result = await request(path, method, admin, body)
        expect(result.status).toBe(422)
        expect(result.code).toBe(1000)
        expect(result.message).toContain(message)
      }
      expect(
        await context()
          .database.select()
          .from(s.projects)
          .where(eq(s.projects.code, "validation-only")),
      ).toHaveLength(0)
    })
    test("项目配置、重复 seed、精确分配及版本检查", async () => {
      const users = await context().database.select().from(s.users),
        a = users.find((u) => u.username === "admin")!,
        first = users.find((u) => u.username === "social")!,
        second = users.find((u) => u.username === "other_social")!
      const created = await request("/projects", "POST", admin, {
        code: "integration-project",
        name: "指标集成项目",
        category: "CONTRACT_PACKAGE",
        ownerOrgId: a.orgId,
        directorId: a.id,
        supervisorId: a.id,
        serviceFieldCode: "社区建设",
      })
      expect(created.code).toBe(0)
      projectId = created.data.id
      expect(
        (await request(`/projects/${projectId}/activate`, "POST", admin, { version: 1 })).code,
      ).toBe(4000)
      expect(
        (
          await request(`/projects/${projectId}/contract`, "PUT", admin, {
            version: 1,
            partnerName: "虚构单位",
            startDate: subtractMonths(businessToday(), 12),
            endDate: subtractMonths(businessToday(), -12),
            amount: "100.10",
            serviceArea: "测试区域",
          })
        ).code,
      ).toBe(0)
      expect(
        (
          await request(`/projects/${projectId}/teams`, "PUT", admin, {
            version: (await project()).version,
            teams: [{ teamId: teamA, reporterId: second.id }],
          })
        ).code,
      ).toBe(1000)
      expect(
        (
          await request(`/projects/${projectId}/teams`, "PUT", admin, {
            version: (await project()).version,
            teams: [
              { teamId: teamA, reporterId: first.id },
              { teamId: teamB, reporterId: second.id },
            ],
          })
        ).code,
      ).toBe(0)
      expect(
        (await request(`/projects/${projectId}/activate`, "POST", admin, { version: 1 })).code,
      ).toBe(4000)
      expect(
        (
          await request(`/projects/${projectId}/activate`, "POST", admin, {
            version: (await project()).version,
          })
        ).code,
      ).toBe(0)
      expect(
        (
          await request(`/projects/${projectId}/indicators`, "POST", admin, {
            name: "人数",
            unit: "人次",
            definition: "按当月新增",
            targetValue: "0",
          })
        ).code,
      ).toBe(1000)
      const i = await request(`/projects/${projectId}/indicators`, "POST", admin, {
        name: "人数",
        unit: "人次",
        definition: "按当月新增",
        targetValue: "0.30",
      })
      expect(i.code).toBe(0)
      indicatorId = i.data.id
      const allocate = (targets: unknown) =>
        request(`/projects/${projectId}/indicators/${indicatorId}/allocations`, "PUT", admin, {
          version: 1,
          targets,
        })
      expect((await allocate([{ teamId: teamA, targetValue: "0.10" }])).code).toBe(0)
      expect(
        (
          await request(
            `/projects/${projectId}/indicators/${indicatorId}/activate`,
            "POST",
            admin,
            { version: 2 },
          )
        ).code,
      ).toBe(4000)
      expect(
        (
          await request(
            `/projects/${projectId}/indicators/${indicatorId}/allocations`,
            "PUT",
            admin,
            {
              version: 2,
              targets: [
                { teamId: teamA, targetValue: "0.10" },
                { teamId: teamB, targetValue: "0.20" },
              ],
            },
          )
        ).code,
      ).toBe(0)
      expect(
        (
          await request(
            `/projects/${projectId}/indicators/${indicatorId}/activate`,
            "POST",
            admin,
            { version: 3 },
          )
        ).code,
      ).toBe(0)
      const count = (await context().database.select().from(s.projects)).length
      await seedIdentity(context().database, {
        adminUsername: "admin",
        adminPassword: "IdentityTest_2026",
        demoPassword: "IdentityTest_2026",
      })
      expect((await context().database.select().from(s.projects)).length).toBe(count)
    })
    test("两团队草稿、重复槽位、提交幂等及累计隔离", async () => {
      const input = { indicatorId, teamId: teamA, month, actualValue: "0.10", note: "甲团队月报" }
      const created = await request("/service/monthly-reports", "POST", social, input)
      expect(created.code).toBe(0)
      reportId = created.data.id
      expect((await request("/service/monthly-reports", "POST", social, input)).code).toBe(4000)
      const progress = await request(
        `/service/indicator-progress?projectId=${projectId}`,
        "GET",
        social,
      )
      expect(progress.data.list).toHaveLength(1)
      expect(progress.data.list[0].cumulative).toBe("0.00")
      expect(progress.data.list[0].statisticsScope).toBe("TEAM")
      expect(
        (
          await request(`/service/monthly-reports/${reportId}/submit`, "POST", other, {
            version: 1,
          })
        ).code,
      ).toBe(2003)
      const submitted = await Promise.all([
        request(`/service/monthly-reports/${reportId}/submit`, "POST", social, { version: 1 }),
        request(`/service/monthly-reports/${reportId}/submit`, "POST", social, { version: 1 }),
      ])
      expect(submitted.map((r) => r.code)).toEqual([0, 0])
      const b = await request("/service/monthly-reports", "POST", other, {
        ...input,
        teamId: teamB,
        actualValue: "0.20",
      })
      expect(b.code).toBe(0)
      expect(
        (
          await request(`/service/monthly-reports/${b.data.id}/submit`, "POST", other, {
            version: 1,
          })
        ).code,
      ).toBe(0)
      const all = await request(`/service/indicator-progress?projectId=${projectId}`)
      expect(
        all.data.list.find((r: { statisticsScope: string }) => r.statisticsScope === "PROJECT"),
      ).toMatchObject({ cumulative: "0.30", completionRate: 100, warningLevel: "green" })
      const part = await request(`/projects/${projectId}`, "GET", social)
      expect(part.data.statisticsScope).toBe("TEAM")
      const linked = await project()
      expect(part.data.ownerOrgName).toBe(linked.ownerOrgName)
      expect(part.data.directorName).toBe(linked.directorName)
      expect(part.data.supervisorName).toBe(linked.supervisorName)
      expect(typeof part.data.ownerOrgName).toBe("string")
      expect(typeof part.data.directorName).toBe("string")
      expect(typeof part.data.supervisorName).toBe("string")
      expect(part.data.users).toBeUndefined()
      expect(part.data.passwordHash).toBeUndefined()
      expect(part.data.teams).toHaveLength(1)
      expect(part.data.indicators[0].targetValue).toBeUndefined()
      expect(part.data.indicators[0].allocations).toHaveLength(1)
      const subtree = await request(`/projects/${projectId}`, "GET", department)
      expect(subtree.data.teams).toHaveLength(1)
      expect((await request(`/service/monthly-reports/${b.data.id}`, "GET", social)).code).not.toBe(
        0,
      )
      expect((await request("/projects/candidates", "GET", social)).code).toBe(2003)
      expect(
        (
          await request(
            `/projects/${projectId}/indicators/${indicatorId}/target-plan`,
            "PUT",
            social,
            { version: 4, targetValue: "0.30", reason: "越权", targets: [] },
          )
        ).code,
      ).toBe(2003)
    })
    test("更正批准前旧值有效、审批幂等、撤销恢复及历史锁定", async () => {
      const created = await request(
        `/service/monthly-reports/${reportId}/change-requests`,
        "POST",
        social,
        {
          version: (await report()).version,
          operation: "CORRECT",
          actualValue: "0.09",
          reason: "补正统计",
        },
      )
      expect(created.code).toBe(0)
      changeId = created.data.id
      expect((await report()).actualValue).toBe("0.10")
      const tasks = await request("/approvals/tasks?status=PENDING", "GET", leader)
      taskId = tasks.data.list.find(
        (t: { instance: { businessId: number } }) => t.instance.businessId === changeId,
      ).id
      expect(
        (await request(`/approvals/tasks/${taskId}/approve`, "POST", admin, { version: 1 })).code,
      ).toBe(2003)
      const decisions = await Promise.all([
        request(`/approvals/tasks/${taskId}/approve`, "POST", leader, {
          version: 1,
          comment: "同意",
        }),
        request(`/approvals/tasks/${taskId}/approve`, "POST", leader, {
          version: 1,
          comment: "同意",
        }),
      ])
      expect(decisions.map((r) => r.code)).toEqual([0, 0])
      expect((await report()).actualValue).toBe("0.09")
      expect(
        (await report()).changes.some(
          (c: { instance: { records: { comment: string | null }[] } }) =>
            c.instance.records.some((record) => record.comment === "同意"),
        ),
      ).toBe(true)
      expect(
        (
          await request(`/approvals/tasks/${taskId}/reject`, "POST", leader, {
            version: 1,
            comment: "相反决策",
          })
        ).code,
      ).toBe(4000)
      for (const operation of ["DELETE", "RESTORE"]) {
        const c = await request(
          `/service/monthly-reports/${reportId}/change-requests`,
          "POST",
          social,
          { version: (await report()).version, operation, reason: "撤销恢复验证" },
        )
        expect(c.code).toBe(0)
        const tasks = await request("/approvals/tasks?status=PENDING", "GET", leader)
        const t = tasks.data.list.find(
          (t: { instance: { businessId: number } }) => t.instance.businessId === c.data.id,
        )
        expect(
          (await request(`/approvals/tasks/${t.id}/approve`, "POST", leader, { version: 1 })).code,
        ).toBe(0)
        expect((await report()).status).toBe(operation === "DELETE" ? "VOID" : "SUBMITTED")
      }
      const i = await indicator()
      expect(
        (
          await request(`/projects/${projectId}/indicators/${indicatorId}`, "PUT", admin, {
            version: i.version,
            name: i.name,
            unit: "场",
            definition: i.definition,
            targetValue: i.targetValue,
          })
        ).code,
      ).toBe(4000)
      const p = await project()
      expect(
        (
          await request(`/projects/${projectId}/contract`, "PUT", admin, {
            partnerName: p.contract.partnerName,
            startDate: businessToday(),
            endDate: p.contract.endDate,
            amount: p.contract.amount,
            serviceArea: p.contract.serviceArea,
            version: p.version,
          })
        ).code,
      ).toBe(4000)
    })
    test("驳回、撤回、自审、未来月份、草稿删除复用和 Excel 权限", async () => {
      const pending = await request(
        `/service/monthly-reports/${reportId}/change-requests`,
        "POST",
        social,
        {
          version: (await report()).version,
          operation: "CORRECT",
          actualValue: "0.08",
          reason: "驳回验证",
        },
      )
      expect(pending.code).toBe(0)
      const t = (await request("/approvals/tasks?status=PENDING", "GET", leader)).data.list.find(
        (t: { instance: { businessId: number } }) => t.instance.businessId === pending.data.id,
      )
      expect(
        (
          await request(`/approvals/tasks/${t.id}/reject`, "POST", leader, {
            version: 1,
            comment: "不符合口径",
          })
        ).code,
      ).toBe(0)
      expect((await report()).actualValue).toBe("0.09")
      const c = await request(
        `/service/monthly-reports/${reportId}/change-requests`,
        "POST",
        social,
        { version: (await report()).version, operation: "DELETE", reason: "撤回验证" },
      )
      expect(c.code).toBe(0)
      expect(
        (await request(`/service/monthly-change-requests/${c.data.id}/withdraw`, "POST", social))
          .code,
      ).toBe(0)
      expect(
        (
          await request(`/service/monthly-reports/${reportId}/change-requests`, "POST", admin, {
            version: (await report()).version,
            operation: "DELETE",
            reason: "管理员无直接主管",
          })
        ).code,
      ).toBe(4000)
      const input = {
        indicatorId,
        teamId: teamA,
        month: subtractMonths(month + "-15", 1).slice(0, 7),
        actualValue: "0.00",
      }
      const draft = await request("/service/monthly-reports", "POST", social, input)
      expect(draft.code).toBe(0)
      expect(
        (await request(`/service/monthly-reports/${draft.data.id}?version=1`, "DELETE", social))
          .code,
      ).toBe(0)
      const reused = await request("/service/monthly-reports", "POST", social, input)
      expect(reused.code).toBe(0)
      expect(reused.data.id).toBe(draft.data.id)
      expect(
        (
          await request("/service/monthly-reports", "POST", social, {
            ...input,
            month: subtractMonths(month + "-15", -1).slice(0, 7),
          })
        ).code,
      ).toBe(1000)
      const denied = await raw("/analysis/exports/monthly-warnings", "GET", social)
      expect(denied.status).toBe(403)
      expect(denied.headers.get("content-type")).toContain("application/json")
      const file = await raw(`/analysis/exports/monthly-warnings?projectId=${projectId}&pageSize=1`)
      expect(file.status).toBe(200)
      const book = new ExcelJS.Workbook()
      await book.xlsx.load(await file.arrayBuffer())
      expect(book.getWorksheet("团队指标")!.rowCount).toBe(3)
      expect(book.getWorksheet("合同指标")!.getCell("H2").value).toBe("0.29")
      // 将第二团队人员暂时改为 SELF，确认局部记录不显示团队完成率。
      const [person] = await context()
        .database.select()
        .from(s.users)
        .where(eq(s.users.username, "other_social"))
      await context()
        .database.update(s.users)
        .set({ dataScope: "SELF" })
        .where(eq(s.users.id, person!.id))
      try {
        const progress = await request(
          `/service/indicator-progress?projectId=${projectId}`,
          "GET",
          other,
        )
        expect(progress.data.list[0].statisticsScope).toBe("SELF")
        expect(progress.data.list[0].completionRate).toBeNull()
      } finally {
        await context()
          .database.update(s.users)
          .set({ dataScope: person!.dataScope })
          .where(eq(s.users.id, person!.id))
      }
    })
    test("原子目标调整、业务候选隔离及并发审批冲突", async () => {
      const i = await indicator()
      const endpoint = `/projects/${projectId}/indicators/${indicatorId}/target-plan`
      expect(
        (
          await request(endpoint, "PUT", admin, {
            version: i.version,
            targetValue: "0.60",
            reason: "不完整分配",
            targets: [{ teamId: teamA, targetValue: "0.20" }],
          })
        ).code,
      ).toBe(4000)
      expect((await indicator()).version).toBe(i.version)
      expect(
        (
          await request(endpoint, "PUT", admin, {
            version: i.version,
            targetValue: "0.60",
            reason: "合同追加目标",
            targets: [
              { teamId: teamA, targetValue: "0.20" },
              { teamId: teamB, targetValue: "0.40" },
            ],
          })
        ).code,
      ).toBe(0)
      expect(
        (
          await request(`/projects/999999/indicators/${indicatorId}/activate`, "POST", admin, {
            version: i.version,
          })
        ).code,
      ).not.toBe(0)
      const candidates = await request("/projects/candidates?kind=filters", "GET", social)
      expect(candidates.code).toBe(0)
      expect(candidates.data.organizations.map((o: { id: number }) => o.id)).toEqual([teamA])
      expect(candidates.data.users).toEqual([])
      const r = await report()
      const applications = await Promise.all([
        request(`/service/monthly-reports/${reportId}/change-requests`, "POST", social, {
          version: r.version,
          operation: "CORRECT",
          actualValue: "0.08",
          reason: "并发一",
        }),
        request(`/service/monthly-reports/${reportId}/change-requests`, "POST", social, {
          version: r.version,
          operation: "CORRECT",
          actualValue: "0.07",
          reason: "并发二",
        }),
      ])
      expect(applications.map((a) => a.code).sort()).toEqual([0, 4000])
      const created = applications.find((a) => a.code === 0)!
      const task = (await request("/approvals/tasks?status=PENDING", "GET", leader)).data.list.find(
        (t: { instance: { businessId: number } }) => t.instance.businessId === created.data.id,
      )
      const outcomes = await Promise.all([
        request(`/approvals/tasks/${task.id}/approve`, "POST", leader, { version: task.version }),
        request(`/approvals/tasks/${task.id}/reject`, "POST", leader, {
          version: task.version,
          comment: "并发相反决策",
        }),
      ])
      expect(outcomes.map((r) => r.code).sort()).toEqual([0, 4000])
      expect(
        (await report()).changes.filter(
          (c: { pendingReportId: number | null }) => c.pendingReportId !== null,
        ),
      ).toHaveLength(0)
    })
    test("业务列表全量排序后分页，预警与导出顺序一致且范围不扩大", async () => {
      for (const [endpoint, sortBy] of [
        ["/projects", "createdAt"],
        ["/service/monthly-reports", "actualValue"],
        ["/approvals/tasks", "createdAt"],
      ]) {
        const token = endpoint === "/approvals/tasks" ? leader : admin
        const params = `sortBy=${sortBy}&sortOrder=asc`
        const all = await request(`${endpoint}?pageSize=100&${params}`, "GET", token)
        expect(all.code).toBe(0)
        const first = await request(`${endpoint}?pageSize=2&page=1&${params}`, "GET", token)
        const second = await request(`${endpoint}?pageSize=2&page=2&${params}`, "GET", token)
        expect([...first.data.list, ...second.data.list].map((r: { id: number }) => r.id)).toEqual(
          all.data.list.slice(0, 4).map((r: { id: number }) => r.id),
        )
        const values = all.data.list.map((r: Record<string, unknown>) =>
          sortBy === "actualValue" ? Number(r.actualValue) : Date.parse(String(r.createdAt)),
        ) as number[]
        expect(values).toEqual([...values].sort((a, b) => a - b))
        for (const field of ["constructor", "passwordHash"])
          expect(
            (await request(`${endpoint}?sortBy=${field}&sortOrder=asc`, "GET", token)).code,
          ).toBe(1000)
      }
      const defaults = (await request("/service/monthly-reports?pageSize=100")).data.list as Array<{
        month: string
        createdAt: string
        id: number
      }>
      expect(defaults.map((r) => r.id)).toEqual(
        [...defaults]
          .sort(
            (a, b) =>
              b.month.localeCompare(a.month) ||
              Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
              b.id - a.id,
          )
          .map((r) => r.id),
      )
      const params = "sortBy=cumulative&sortOrder=desc"
      const progress = await request(`/service/indicator-progress?pageSize=100&${params}`)
      const warnings = await request(`/analysis/monthly-warnings?pageSize=100&${params}`)
      expect(progress.code).toBe(0)
      expect(warnings.code).toBe(0)
      expect(warnings.data.list).toEqual(progress.data.list)
      const amounts = progress.data.list.map((r: { cumulative: string }) =>
        Number(r.cumulative),
      ) as number[]
      expect(amounts).toEqual([...amounts].sort((a, b) => b - a))
      const first = await request(`/service/indicator-progress?pageSize=2&${params}`)
      expect(first.data.list).toEqual(progress.data.list.slice(0, 2))
      const file = await raw(`/analysis/exports/monthly-warnings?pageSize=1&${params}`)
      expect(file.status).toBe(200)
      const book = new ExcelJS.Workbook()
      await book.xlsx.load(await file.arrayBuffer())
      for (const [scope, sheetName] of [
        ["PROJECT", "合同指标"],
        ["TEAM", "团队指标"],
      ]) {
        const expected = progress.data.list
          .filter((r: { statisticsScope: string }) => r.statisticsScope === scope)
          .map(
            (r: {
              projectName: string
              indicatorName: string
              teamName: string
              cumulative: string
            }) => [r.projectName, r.indicatorName, r.teamName, r.cumulative],
          )
        const sheet = book.getWorksheet(sheetName!)!
        const actual = Array.from({ length: sheet.rowCount - 1 }, (_, index) =>
          [1, 2, 5, 8].map((col) => sheet.getCell(index + 2, col).value),
        )
        expect(actual).toEqual(expected)
      }
      const scoped = await request(`/service/indicator-progress?${params}`, "GET", social)
      expect(
        scoped.data.list.every(
          (r: { teamId: number; statisticsScope: string }) =>
            r.teamId === teamA && r.statisticsScope === "TEAM",
        ),
      ).toBe(true)
      const hidden = await request(`/projects/${projectId}`, "GET", social)
      expect(
        hidden.data.indicators.every((r: { targetValue?: string }) => r.targetValue === undefined),
      ).toBe(true)
      expect(
        (await request("/service/indicator-progress?sortBy=constructor&sortOrder=asc")).code,
      ).toBe(1000)
    })
  })
}
