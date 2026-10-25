import { beforeAll, describe, expect, test } from "bun:test"
import { eq, sql } from "drizzle-orm"
import ExcelJS from "exceljs"
import * as s from "@/db/schema"
import type { Database } from "@/modules/identity/identity.repository"
import { businessToday, subtractMonths } from "@/modules/service/indicator-calculation"
import { env } from "@/utils/env"

/** 身份与业务共用隔离库，覆盖新第三阶段的分批验收。 */
export function registerProjectTests(
  context: () => { database: Database; handle: (r: Request) => Response | Promise<Response> },
) {
  describe("第三阶段合同包与服务档案", () => {
    let admin = "",
      manager = "",
      supervisor = "",
      social = "",
      other = "",
      leader = "",
      department = ""
    let projectId = 0,
      otherProjectId = 0,
      indicatorId = 0,
      teamA = 0,
      teamB = 0,
      socialId = 0,
      otherId = 0,
      managerId = 0,
      supervisorId = 0
    let firstRecord = 0,
      secondRecord = 0,
      fileId = 0
    const today = businessToday(),
      start = subtractMonths(today, 1),
      end = subtractMonths(today, -12)
    const base = "/service/contract-package-projects"
    /** JSON与multipart均通过真实应用请求链路，文件下载保留原始响应。 */
    async function raw(path: string, method = "GET", token = manager, body?: unknown) {
      const multipart = body instanceof FormData
      return context().handle(
        new Request(`http://localhost/api${path}`, {
          method,
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body && !multipart ? { "content-type": "application/json" } : {}),
          },
          ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}),
        }),
      )
    }
    async function request(path: string, method = "GET", token = manager, body?: unknown) {
      const r = await raw(path, method, token, body)
      return { status: r.status, ...(await r.json()) }
    }
    async function login(username: string) {
      const r = await request("/auth/login", "POST", "", {
        username,
        password: "IdentityTest_2026",
      })
      expect(r.code).toBe(0)
      return r.data.token as string
    }
    async function project(id = projectId) {
      return (await request(`${base}/${id}`)).data
    }
    async function record(id = firstRecord) {
      return (await request(`/service/records/${id}`, "GET", social)).data
    }
    async function progress() {
      return (
        await request(
          `/service/indicator-progress?projectId=${projectId}&indicatorId=${indicatorId}&teamId=${teamA}`,
          "GET",
          social,
        )
      ).data.list[0]?.cumulative
    }
    async function taskFor(id: number, token = leader) {
      const r = await request("/approvals/tasks?status=PENDING&pageSize=100", "GET", token)
      return r.data.list.find(
        (t: { instance: { businessSnapshot: { reportId: number } } }) =>
          t.instance.businessSnapshot.reportId === id,
      )
    }
    async function decide(id: number, approved = true, token = leader) {
      const task = await taskFor(id, token)
      expect(task).toBeDefined()
      return request(
        `/approvals/tasks/${task.id}/${approved ? "approve" : "reject"}`,
        "POST",
        token,
        { version: task.version, comment: approved ? "核对通过" : "请补充说明" },
      )
    }
    beforeAll(async () => {
      Object.assign(env, { devSuperadminUsername: "" })
      admin = await login("admin")
      manager = await login("project_manager")
      supervisor = await login("supervisor")
      social = await login("social")
      other = await login("other_social")
      leader = await login("leader")
      department = await login("department")
      const orgs = await context().database.select().from(s.organizations),
        users = await context().database.select().from(s.users)
      teamA = orgs.find((o) => o.code === "demo-team-a")!.id
      teamB = orgs.find((o) => o.code === "demo-team-b")!.id
      socialId = users.find((u) => u.username === "social")!.id
      otherId = users.find((u) => u.username === "other_social")!.id
      managerId = users.find((u) => u.username === "project_manager")!.id
      supervisorId = users.find((u) => u.username === "supervisor")!.id
    })
    test("第一批：多领域和督导身份，普通岗位不能越过资格", async () => {
      expect((await request("/dictionaries/serviceFields", "GET", admin)).data).toHaveLength(23)
      expect((await request("/dictionaries/subFields", "GET", admin)).data).toHaveLength(5)
      expect((await request("/dictionaries/brands", "GET", admin)).data).toHaveLength(5)
      const u = (await request(`/users/${socialId}`, "GET", admin)).data
      expect(
        (
          await request(`/users/${socialId}`, "PUT", admin, {
            version: u.version,
            orgId: teamA,
            positionCode: "position-3",
            supervisorId: u.supervisorId,
            name: u.name,
            phone: u.phone,
            isSupervisor: true,
            serviceFieldCodes: ["社区建设"],
          })
        ).code,
      ).toBe(1000)
      expect(
        (
          await request("/auth/profile", "PUT", social, {
            version: u.version,
            serviceFieldCodes: ["社会福利", "社区建设"],
          })
        ).code,
      ).toBe(0)
      expect((await request("/auth/profile", "GET", social)).data.serviceFieldCodes).toEqual([
        "社会福利",
        "社区建设",
      ])
      await request("/auth/profile", "PUT", social, { version: u.version + 1, isSupervisor: true })
      expect((await request("/auth/profile", "GET", social)).data.isSupervisor).toBe(false)
    })
    test("第二批：合同包分表、可选多选领域和同人高级主任／督导", async () => {
      const users = await context().database.select().from(s.users),
        m = users.find((u) => u.id === managerId)!
      const payload = {
        code: "stage3-contract",
        name: "合同包验收项目",
        category: "CONTRACT_PACKAGE",
        ownerOrgId: m.orgId,
        directorId: managerId,
        seniorDirectorId: supervisorId,
        supervisorId,
        serviceFieldCode: "社区建设",
        subFieldCodes: ["长者服务", "志愿者服务"],
        brandCodes: ["馨生活", "馨+"],
      }
      expect((await request(base, "POST", social, payload)).code).toBe(2003)
      expect((await request(base, "POST", admin, payload)).code).toBe(2003)
      expect(
        (await request(base, "POST", manager, { ...payload, category: "HEADQUARTERS" })).status,
      ).toBe(422)
      const created = await request(base, "POST", manager, payload)
      expect(created.code).toBe(0)
      projectId = created.data.id
      expect((await project()).subFieldCodes).toEqual(payload.subFieldCodes)
      expect((await project()).seniorDirectorId).toBe((await project()).supervisorId)
      expect(
        (
          await request(`${base}/${projectId}/contract`, "PUT", manager, {
            version: (await project()).version,
            partnerName: "验收单位",
            startDate: start,
            endDate: end,
            amount: "100.10",
            serviceArea: "福田区",
          })
        ).code,
      ).toBe(0)
      expect(
        (
          await request(`${base}/${projectId}/teams`, "PUT", manager, {
            version: (await project()).version,
            teams: [
              { teamId: teamA, reporterId: socialId },
              { teamId: teamB, reporterId: otherId },
            ],
          })
        ).code,
      ).toBe(0)
      const usersA = users.filter((u) => u.orgId === teamA)
      expect(
        (
          await request(`${base}/${projectId}/members`, "PUT", manager, {
            version: (await project()).version,
            members: usersA.map((u) => ({
              userId: u.id,
              teamId: teamA,
              startDate: start,
              endDate: end,
            })),
          })
        ).code,
      ).toBe(0)
      expect(
        (
          await request(`${base}/${projectId}/activate`, "POST", manager, {
            version: (await project()).version,
          })
        ).code,
      ).toBe(0)
      const i = await request(`${base}/${projectId}/indicators`, "POST", manager, {
        name: "服务人次",
        unit: "人次",
        definition: "实际服务参与人次",
        targetValue: "100.10",
      })
      expect(i.code).toBe(0)
      indicatorId = i.data.id
      expect(
        (
          await request(
            `${base}/${projectId}/indicators/${indicatorId}/allocations`,
            "PUT",
            manager,
            {
              version: 1,
              targets: [
                { teamId: teamA, targetValue: "60.05" },
                { teamId: teamB, targetValue: "40.05" },
              ],
            },
          )
        ).code,
      ).toBe(0)
      expect(
        (
          await request(
            `${base}/${projectId}/indicators/${indicatorId}/activate`,
            "POST",
            manager,
            { version: 2 },
          )
        ).code,
      ).toBe(0)
      expect(
        (await request(`${base}/${projectId}`, "GET", social)).data.teams.map(
          (t: { teamId: number }) => t.teamId,
        ),
      ).toEqual([teamA])
      expect(
        (await request(`${base}/${projectId}`, "GET", social)).data.indicators[0].targetValue,
      ).toBeUndefined()
      expect(
        (await request(`${base}/${projectId}`, "GET", social)).data.contract.amount,
      ).toBeUndefined()
      expect((await request(`${base}/${projectId}`, "GET", other)).code).toBe(3000)
      expect((await request(`${base}?pageSize=10`, "GET", admin)).data.total).toBe(0)
      expect(
        (await request(`${base}/candidates?kind=filters`, "GET", social)).data.serviceAreas,
      ).toEqual(["福田区"])
    })
    test("第二批：按负责关系多项目、低岗位单项目与范围隔离", async () => {
      const users = await context().database.select().from(s.users),
        d = users.find((u) => u.username === "department")!
      const created = await request(base, "POST", department, {
        code: "stage3-other",
        name: "其他团队项目",
        category: "CONTRACT_PACKAGE",
        ownerOrgId: d.orgId,
        directorId: d.id,
        seniorDirectorId: d.id,
        supervisorId: null,
        serviceFieldCode: "社会福利",
      })
      expect(created.code).toBe(0)
      otherProjectId = created.data.id
      let p = (await request(`${base}/${otherProjectId}`, "GET", department)).data
      expect(
        (
          await request(`${base}/${otherProjectId}/contract`, "PUT", department, {
            version: p.version,
            partnerName: "另一单位",
            startDate: start,
            endDate: end,
            amount: "20.00",
            serviceArea: "南山区",
          })
        ).code,
      ).toBe(0)
      p = (await request(`${base}/${otherProjectId}`, "GET", department)).data
      expect(
        (
          await request(`${base}/${otherProjectId}/teams`, "PUT", department, {
            version: p.version,
            teams: [
              { teamId: teamA, reporterId: socialId },
              { teamId: teamB, reporterId: otherId },
            ],
          })
        ).code,
      ).toBe(0)
      p = (await request(`${base}/${otherProjectId}`, "GET", department)).data
      const concurrent = await Promise.all([
        request(`${base}/${otherProjectId}/members`, "PUT", department, {
          version: p.version,
          members: [{ userId: socialId, teamId: teamA, startDate: start, endDate: end }],
        }),
        request(`${base}/${otherProjectId}/members`, "PUT", department, {
          version: p.version,
          members: [{ userId: otherId, teamId: teamB, startDate: start, endDate: end }],
        }),
      ])
      expect(concurrent.map((r) => r.code).sort()).toEqual([0, 4000])
      expect((await request(`${base}/${otherProjectId}`, "GET", manager)).code).toBe(3000)
      expect((await request(`${base}?teamId=${teamB}`, "GET", social)).data.total).toBe(0)
      expect((await request("/service/reporting-context", "GET", social)).data).toMatchObject({
        fixedProject: true,
        projects: [{ id: projectId, name: "合同包验收项目" }],
      })
      const { id: second } = (
        await request(base, "POST", manager, {
          code: "stage3-manager-second",
          name: "同负责人第二项目",
          category: "CONTRACT_PACKAGE",
          ownerOrgId: users.find((u) => u.id === managerId)!.orgId,
          directorId: managerId,
          seniorDirectorId: managerId,
          supervisorId: null,
          serviceFieldCode: "社区建设",
        })
      ).data
      expect(second).toBeGreaterThan(0)
      expect((await request(base, "GET", manager)).data.total).toBe(2)
      expect((await request(base, "GET", supervisor)).data.total).toBe(1)
    })
    test("第三批：合同多附件、内容识别、越权与下载", async () => {
      const form = () => {
        const f = new FormData()
        f.append(
          "file",
          new File(["%PDF-1.7\n验收合同\n%%EOF"], "电子合同.pdf", { type: "application/pdf" }),
        )
        return f
      }
      const uploaded = await request(`${base}/${projectId}/contract/files`, "POST", manager, form())
      expect(uploaded.code).toBe(0)
      fileId = uploaded.data.id
      expect(
        (await request(`${base}/${projectId}/contract/files`, "POST", manager, form())).code,
      ).toBe(0)
      const list = await request(`${base}/${projectId}/contract/files`, "GET", social)
      expect(list.data).toHaveLength(2)
      expect(list.data[0].storageKey).toBeUndefined()
      expect(
        (await request(`${base}/${projectId}/contract/files`, "POST", social, form())).code,
      ).toBe(2003)
      const forbidden = await raw(`/files/${fileId}/download`, "GET", other)
      expect(forbidden.status).toBe(403)
      const download = await raw(`/files/${fileId}/download`, "GET", social)
      expect(download.headers.get("content-type")).toBe("application/pdf")
      expect(await download.text()).toContain("%PDF")
      const bad = new FormData()
      bad.append("file", new File(["invalid"], "伪造合同.pdf"))
      expect(
        (await request(`${base}/${projectId}/contract/files`, "POST", manager, bad)).code,
      ).toBe(1000)
    })
    test("第四批：同月逐次记录、幂等、首次待审不累计和批准", async () => {
      const payload = {
        indicatorId,
        teamId: teamA,
        serviceDate: today,
        actualValue: "2.25",
        note: "第一次服务",
        requestKey: "first-service",
      }
      const duplicates = await Promise.all([
        request("/service/records", "POST", social, payload),
        request("/service/records", "POST", social, payload),
      ])
      expect(duplicates.map((r) => r.code)).toEqual([0, 0])
      expect(duplicates[0].data.id).toBe(duplicates[1].data.id)
      firstRecord = duplicates[0].data.id
      secondRecord = (
        await request("/service/records", "POST", social, {
          ...payload,
          requestKey: "second-service",
          actualValue: "1.10",
        })
      ).data.id
      expect(secondRecord).not.toBe(firstRecord)
      expect(
        (await request("/service/records", "POST", social, { ...payload, actualValue: "3.25" }))
          .code,
      ).toBe(4000)
      expect(
        (
          await request("/service/records", "POST", social, {
            ...payload,
            requestKey: "bad-team",
            teamId: teamB,
          })
        ).code,
      ).toBe(2003)
      expect(
        (
          await request("/service/records", "POST", social, {
            ...payload,
            requestKey: "bad-date",
            serviceDate: "2099-01-01",
          })
        ).code,
      ).not.toBe(0)
      expect(await progress()).toBe("0.00")
      expect(
        (await request(`/service/records/${firstRecord}/submit`, "POST", social, { version: 1 }))
          .code,
      ).toBe(0)
      expect(
        (await request(`/service/records/${firstRecord}/submit`, "POST", social, { version: 1 }))
          .code,
      ).toBe(0)
      expect((await record()).status).toBe("IN_REVIEW")
      expect(await progress()).toBe("0.00")
      const task = await taskFor(firstRecord)
      expect(
        (
          await request(`/approvals/tasks/${task.id}/approve`, "POST", admin, {
            version: task.version,
          })
        ).code,
      ).toBe(2003)
      expect((await decide(firstRecord)).code).toBe(0)
      expect(await progress()).toBe("2.25")
      expect(
        (
          await request(`/approvals/tasks/${task.id}/approve`, "POST", leader, {
            version: task.version,
          })
        ).code,
      ).toBe(0)
      expect(
        (
          await request(`/approvals/tasks/${task.id}/reject`, "POST", leader, {
            version: task.version,
            comment: "相反决定",
          })
        ).code,
      ).toBe(4000)
      expect((await request(`/service/records/${firstRecord}`, "GET", other)).code).not.toBe(0)
    })
    test("第四批：更正前旧值、撤销恢复、驳回及撤回重提", async () => {
      const change = await request(
        `/service/records/${firstRecord}/change-requests`,
        "POST",
        social,
        {
          version: (await record()).version,
          operation: "CORRECT",
          actualValue: "3.30",
          reason: "补齐人数",
        },
      )
      expect(change.code).toBe(0)
      expect(await progress()).toBe("2.25")
      expect((await decide(firstRecord)).code).toBe(0)
      expect(await progress()).toBe("3.30")
      for (const [operation, expected] of [
        ["DELETE", "0.00"],
        ["RESTORE", "3.30"],
      ]) {
        expect(
          (
            await request(`/service/records/${firstRecord}/change-requests`, "POST", social, {
              version: (await record()).version,
              operation,
              reason: "状态核对",
            })
          ).code,
        ).toBe(0)
        expect((await decide(firstRecord)).code).toBe(0)
        expect(await progress()).toBe(expected)
      }
      expect(
        (
          await request(`/service/records/${secondRecord}/submit`, "POST", social, {
            version: (await record(secondRecord)).version,
          })
        ).code,
      ).toBe(0)
      expect((await decide(secondRecord, false)).code).toBe(0)
      expect((await record(secondRecord)).status).toBe("REJECTED")
      expect(await progress()).toBe("3.30")
      expect(
        (
          await request(`/service/records/${secondRecord}/submit`, "POST", social, {
            version: (await record(secondRecord)).version,
          })
        ).code,
      ).toBe(0)
      expect(
        (await request(`/service/records/${secondRecord}/withdraw`, "POST", social)).code,
      ).toBe(0)
      expect((await record(secondRecord)).status).toBe("DRAFT")
      expect(
        (
          await request(`/service/records/${secondRecord}/submit`, "POST", social, {
            version: (await record(secondRecord)).version,
          })
        ).code,
      ).toBe(0)
      expect((await decide(secondRecord)).code).toBe(0)
      expect(await progress()).toBe("4.40")
    })
    test("第五批：分页排序、保留Excel与监测范围一致", async () => {
      for (let n = 0; n < 12; n++)
        expect(
          (
            await request("/service/records", "POST", social, {
              indicatorId,
              teamId: teamA,
              serviceDate: today,
              actualValue: String(n),
              requestKey: `paging-${n}`,
            })
          ).code,
        ).toBe(0)
      const first = await request(
          "/service/records?pageSize=10&sortBy=createdAt&sortOrder=desc",
          "GET",
          social,
        ),
        second = await request(
          "/service/records?page=2&pageSize=10&sortBy=createdAt&sortOrder=desc",
          "GET",
          social,
        )
      expect(first.data.total).toBe(14)
      expect(first.data.list).toHaveLength(10)
      expect(second.data.list).toHaveLength(4)
      expect(first.data.list[9].id).toBeGreaterThan(second.data.list[0].id)
      expect((await request("/service/records?pageSize=101", "GET", social)).code).toBe(1000)
      expect(
        (await request("/service/records?sortBy=constructor&sortOrder=asc", "GET", social)).code,
      ).toBe(1000)
      const rows = (await request("/service/indicator-progress?pageSize=100", "GET", social)).data
        .list
      expect(rows.every((r: { teamId: number }) => r.teamId === teamA)).toBe(true)
      const exported = await raw("/analysis/exports/indicators?pageSize=1", "GET", manager)
      expect(exported.status).toBe(200)
      const book = new ExcelJS.Workbook()
      await book.xlsx.load(
        Buffer.from(await exported.arrayBuffer()) as unknown as Parameters<
          typeof book.xlsx.load
        >[0],
      )
      expect(book.getWorksheet("团队指标")!.rowCount).toBe(3)
      expect(book.getWorksheet("团队指标")!.getCell("H2").value).toBe("4.40")
    })
    test("权限验收：开发业务维护独立启用，普通管理员无全局业务例外", async () => {
      const original = env.devSuperadminUsername
      const originalNodeEnv = env.nodeEnv
      try {
        Object.assign(env, { devSuperadminUsername: "admin" })
        Object.assign(env, { nodeEnv: "production" })
        expect((await request("/auth/profile", "GET", admin)).data.isDevSuperadmin).toBe(false)
        expect((await request(base, "GET", admin)).data.total).toBe(0)
        expect((await request(`${base}/candidates`, "GET", admin)).code).toBe(2003)
        Object.assign(env, { nodeEnv: originalNodeEnv })
        expect((await request("/auth/profile", "GET", admin)).data.isDevSuperadmin).toBe(true)
        expect((await request(base, "GET", admin)).data.total).toBe(3)
        expect((await raw(`/files/${fileId}/download`, "GET", admin)).status).toBe(200)
        const tasks = (await request("/approvals/tasks?pageSize=100", "GET", admin)).data.list
        expect(tasks.length).toBeGreaterThan(0)
        expect(tasks.every((t: { canDecide: boolean }) => !t.canDecide)).toBe(true)
        expect(
          (
            await request(`${base}/${projectId}`, "PUT", admin, {
              ...(await project()),
              version: (await project()).version,
            })
          ).code,
        ).toBe(0)
      } finally {
        Object.assign(env, { devSuperadminUsername: original, nodeEnv: originalNodeEnv })
      }
      expect((await request(base, "GET", admin)).data.total).toBe(0)
      await context()
        .database.update(s.users)
        .set({ dataScope: "ALL" })
        .where(eq(s.users.id, socialId))
      expect((await request("/auth/profile", "GET", social)).data.dataScope).toBe("TEAM")
      expect((await request(base, "GET", social)).data.total).toBe(1)
      await context()
        .database.update(s.users)
        .set({ dataScope: "TEAM" })
        .where(eq(s.users.id, socialId))
    })
    test("开发超管可新增维护和跨团队填报，负责人资格与直接主管审批保留", async () => {
      const original = env.devSuperadminUsername,
        originalNodeEnv = env.nodeEnv
      const database = context().database
      const [adminUser] = await database.select().from(s.users).where(eq(s.users.username, "admin"))
      try {
        Object.assign(env, { devSuperadminUsername: "admin", nodeEnv: "development" })
        const candidates = await request(`${base}/candidates`, "GET", admin)
        expect(candidates.code).toBe(0)
        expect(candidates.data.users.some((u: { id: number }) => u.id === managerId)).toBe(true)
        const payload = {
          code: "development-admin-created",
          name: "开发超管登记项目",
          category: "CONTRACT_PACKAGE",
          ownerOrgId: adminUser.orgId,
          directorId: managerId,
          seniorDirectorId: supervisorId,
          supervisorId: null,
          serviceFieldCode: "社区建设",
        }
        expect(
          (await request(base, "POST", admin, { ...payload, seniorDirectorId: adminUser.id })).code,
        ).toBe(1000)
        const created = await request(base, "POST", admin, payload)
        expect(created.code).toBe(0)
        const id = created.data.id
        const detail = (await request(`${base}/${id}`, "GET", admin)).data
        expect(detail.canManage).toBe(true)
        expect(detail.directorId).toBe(managerId)
        expect(detail.seniorDirectorId).toBe(supervisorId)
        expect(
          (
            await request(`${base}/${id}`, "PUT", admin, {
              ...payload,
              name: "开发超管已维护项目",
              version: detail.version,
            })
          ).code,
        ).toBe(0)
        const updated = (await request(`${base}/${id}`, "GET", admin)).data
        expect(updated.name).toBe("开发超管已维护项目")
        expect(
          (await request(`${base}/${id}?version=${updated.version}`, "DELETE", admin)).code,
        ).toBe(0)

        const reporting = (await request("/service/reporting-context", "GET", admin)).data
        expect(reporting.fixedProject).toBe(false)
        expect(reporting.projects.some((p: { id: number }) => p.id === projectId)).toBe(true)
        expect(reporting.slots.some((t: { teamId: number }) => t.teamId === teamA)).toBe(true)
        expect(reporting.slots.some((t: { teamId: number }) => t.teamId === teamB)).toBe(true)
        const input = {
          indicatorId,
          teamId: teamB,
          serviceDate: today,
          actualValue: "0.10",
          requestKey: "development-admin-service-record",
        }
        const draft = await request("/service/records", "POST", admin, input)
        expect(draft.code).toBe(0)
        const recordId = draft.data.id
        const read = async () => (await request(`/service/records/${recordId}`, "GET", admin)).data
        expect((await read()).canMaintain).toBe(true)
        expect(
          (
            await request(`/service/records/${recordId}`, "PUT", admin, {
              ...input,
              actualValue: "0.20",
              version: (await read()).version,
            })
          ).code,
        ).toBe(0)
        expect(
          (
            await request(`/service/records/${recordId}/submit`, "POST", admin, {
              version: (await read()).version,
            })
          ).message,
        ).toBe("请先配置启用的直接主管，且不得自审")
        await database.update(s.users).set({ supervisorId }).where(eq(s.users.id, adminUser.id))
        expect(
          (
            await request(`/service/records/${recordId}/submit`, "POST", admin, {
              version: (await read()).version,
            })
          ).code,
        ).toBe(0)
        expect((await read()).status).toBe("IN_REVIEW")
        expect((await decide(recordId, true, admin)).code).toBe(2003)
        expect((await read()).status).toBe("IN_REVIEW")
        expect((await decide(recordId, true, supervisor)).code).toBe(0)
        expect((await read()).status).toBe("SUBMITTED")

        Object.assign(env, { devSuperadminUsername: "social" })
        expect((await request(base, "POST", social, payload)).code).toBe(2003)
        Object.assign(env, { devSuperadminUsername: "admin", nodeEnv: "production" })
        expect((await request(base, "POST", admin, payload)).code).toBe(2003)
        expect((await request("/service/records", "POST", admin, input)).code).toBe(2003)
      } finally {
        await database
          .update(s.users)
          .set({ supervisorId: adminUser.supervisorId })
          .where(eq(s.users.id, adminUser.id))
        Object.assign(env, { devSuperadminUsername: original, nodeEnv: originalNodeEnv })
      }
    })
    test("迁移验收：历史月份与总部数据保留，旧在途变更可继续审批", async () => {
      const db = context().database
      const [legacy] = await db.insert(s.legacyProjects).values({
        id: 4000,
        code: "legacy-contract",
        name: "历史合同包",
        category: "CONTRACT_PACKAGE",
        ownerOrgId: 1,
        directorId: managerId,
        supervisorId,
        serviceFieldCode: "社区建设",
        status: "ACTIVE",
        createdBy: managerId,
      })
      expect(legacy.affectedRows).toBe(1)
      await db.insert(s.legacyProjects).values({
        id: 4001,
        code: "legacy-headquarters",
        name: "历史总部",
        category: "HEADQUARTERS",
        ownerOrgId: 1,
        directorId: managerId,
        supervisorId,
        serviceFieldCode: "社区建设",
        createdBy: managerId,
      })
      await db.insert(s.legacyProjectContracts).values({
        id: 4000,
        projectId: 4000,
        partnerName: "历史合作方",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        amount: "20.00",
        serviceArea: "历史区域",
      })
      await db
        .insert(s.legacyProjectTeams)
        .values({ id: 4000, projectId: 4000, teamId: teamA, reporterId: socialId })
      await db.insert(s.legacyProjectIndicators).values({
        id: 4000,
        projectId: 4000,
        name: "历史指标",
        unit: "人次",
        definition: "历史月汇总",
        targetValue: "100.00",
        status: "ACTIVE",
      })
      await db
        .insert(s.legacyTeamIndicatorTargets)
        .values({ id: 4000, indicatorId: 4000, teamId: teamA, targetValue: "100.00" })
      await db.insert(s.legacyMonthlyReports).values({
        id: 4000,
        indicatorId: 4000,
        teamId: teamA,
        month: "2025-11",
        actualValue: "7.50",
        status: "SUBMITTED",
        createdBy: socialId,
        submittedAt: new Date("2025-11-30T00:00:00Z"),
      })
      await db.insert(s.legacyMonthlyReportChanges).values({
        id: 4000,
        reportId: 4000,
        operation: "CORRECT",
        reportVersion: 1,
        beforeValue: "7.50",
        beforeStatus: "SUBMITTED",
        proposedValue: "8.50",
        reason: "历史待办",
        applicantId: socialId,
        pendingReportId: 4000,
      })
      const migration = await Bun.file("drizzle/0003_contract-service-records.sql").text()
      const copy = migration.slice(migration.indexOf("INSERT INTO `contract_projects`"))
      for (const statement of copy
        .split("--> statement-breakpoint")
        .map((x) => x.trim())
        .filter(Boolean))
        await db.execute(sql.raw(statement))
      const old = (await db.select().from(s.monthlyReports).where(eq(s.monthlyReports.id, 4000)))[0]
      expect(old.serviceDate).toBeNull()
      expect(old.legacyReportId).toBe(4000)
      expect(old.month).toBe("2025-11")
      expect(old.actualValue).toBe("7.50")
      expect(
        (await db.select().from(s.headquartersProjects)).map((p) => p.legacyProjectId),
      ).toContain(4001)
      const [instance] = await db.insert(s.approvalInstances).values({
        businessType: "MONTHLY_CHANGE",
        businessId: 4000,
        applicantId: socialId,
        workflowSnapshot: { nodes: [{ approverIds: [supervisorId] }] },
        businessSnapshot: {
          reportId: 4000,
          projectName: "历史合同包",
          indicatorName: "历史指标",
          month: "2025-11",
        },
      })
      const [task] = await db
        .insert(s.approvalTasks)
        .values({ instanceId: instance.insertId, approverId: supervisorId })
      expect(
        (
          await request(`/approvals/tasks/${task.insertId}/approve`, "POST", supervisor, {
            version: 1,
          })
        ).code,
      ).toBe(0)
      expect(
        (await db.select().from(s.monthlyReports).where(eq(s.monthlyReports.id, 4000)))[0]
          .actualValue,
      ).toBe("8.50")
      expect(
        (
          await db.select().from(s.legacyMonthlyReports).where(eq(s.legacyMonthlyReports.id, 4000))
        )[0].actualValue,
      ).toBe("7.50")
      const r = await request(
        "/service/indicator-progress?projectId=4000&teamId=" + teamA,
        "GET",
        social,
      )
      expect(r.data.list[0].cumulative).toBe("8.50")
    })
    test("迁移边界：历史总部与新档案变更编号重合仍分别关联审批", async () => {
      const db = context().database
      await db.insert(s.legacyProjectIndicators).values({
        id: 4001,
        projectId: 4001,
        name: "历史总部指标",
        unit: "人次",
        definition: "总部历史记录",
        targetValue: "10.00",
      })
      await db
        .insert(s.legacyTeamIndicatorTargets)
        .values({ id: 4001, indicatorId: 4001, teamId: teamA, targetValue: "10.00" })
      await db.insert(s.legacyMonthlyReports).values({
        id: 4001,
        indicatorId: 4001,
        teamId: teamA,
        month: "2025-11",
        actualValue: "1.00",
        status: "SUBMITTED",
        createdBy: socialId,
        submittedAt: new Date("2025-11-30T00:00:00Z"),
      })
      await db.insert(s.legacyMonthlyReportChanges).values({
        id: 4001,
        reportId: 4001,
        operation: "CORRECT",
        reportVersion: 1,
        beforeValue: "1.00",
        beforeStatus: "SUBMITTED",
        proposedValue: "2.00",
        reason: "历史总部待办",
        applicantId: socialId,
        pendingReportId: 4001,
      })
      const [oldInstance] = await db.insert(s.approvalInstances).values({
        businessType: "MONTHLY_CHANGE",
        businessId: 4001,
        applicantId: socialId,
        workflowSnapshot: { nodes: [{ approverIds: [supervisorId] }] },
        businessSnapshot: {
          reportId: 4001,
          projectName: "历史总部",
          operation: "CORRECT",
          beforeValue: "1.00",
          proposedValue: "2.00",
        },
      })
      const [oldTask] = await db
        .insert(s.approvalTasks)
        .values({ instanceId: oldInstance.insertId, approverId: supervisorId })
      const changed = await request(
        `/service/records/${firstRecord}/change-requests`,
        "POST",
        social,
        {
          version: (await record()).version,
          operation: "CORRECT",
          actualValue: "3.55",
          reason: "新档案复核",
        },
      )
      expect(changed.code).toBe(0)
      expect(changed.data.id).toBe(4001)
      const history = (await record()).changes.find((c: { id: number }) => c.id === changed.data.id)
      expect(history.instance.businessType).toBe("SERVICE_CHANGE")
      expect(
        (
          await request(`/approvals/tasks/${oldTask.insertId}/approve`, "POST", supervisor, {
            version: 1,
          })
        ).code,
      ).toBe(4000)
      expect((await record()).actualValue).toBe("3.30")
      const pending = (
        await request("/approvals/tasks?status=PENDING&pageSize=100", "GET", supervisor)
      ).data.list.find((t: { id: number }) => t.id === oldTask.insertId)
      expect(pending.canDecide).toBe(false)
      expect(
        (
          await request(
            `/service/record-change-requests/${changed.data.id}/withdraw`,
            "POST",
            social,
          )
        ).code,
      ).toBe(0)
      expect(
        (
          await db
            .select()
            .from(s.approvalInstances)
            .where(eq(s.approvalInstances.id, oldInstance.insertId))
        )[0].status,
      ).toBe("IN_REVIEW")
      expect(
        (
          await db
            .select()
            .from(s.approvalInstances)
            .where(eq(s.approvalInstances.id, changed.data.instanceId))
        )[0].status,
      ).toBe("CANCELLED")
    })
  })
}
