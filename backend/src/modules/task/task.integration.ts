import { beforeAll, describe, expect, test } from "bun:test"
import { eq, sql } from "drizzle-orm"
import * as s from "@/db/schema"
import { env } from "@/utils/env"
import type { Database } from "@/modules/identity/identity.repository"
import {
  ProjectRepository,
  type BusinessConnection,
  type BusinessState,
} from "@/modules/project/project.repository"
import { IdentityRepository } from "@/modules/identity/identity.repository"
import { IdentityService } from "@/modules/identity/identity.service"
import type { Actor } from "@/utils/authorization"
import { TaskService } from "./task.service"
import { grantTaskPermissions } from "./task.seed"
import { businessDate, nextDay } from "./task-calendar"

export function registerTaskTests(
  context: () => { database: Database; handle: (r: Request) => Response | Promise<Response> },
) {
  describe("B2服务任务与阶段计划", () => {
    let manager = "",
      leader = "",
      social = "",
      other = "",
      admin = "",
      projectId = 0,
      teamId = 0,
      socialId = 0,
      leaderId = 0,
      targetId = 0,
      indicatorId = 0,
      planId = 0,
      taskId = 0,
      resourceId = 0,
      contactId = 0,
      pointId = 0
    const today = businessDate(),
      end = nextDay(today, 70),
      day = nextDay(today, 2),
      mid = nextDay(today, 34)
    const base = "/service/tasks",
      plans = "/service/plans"
    async function request(path: string, method = "GET", token = manager, input?: unknown) {
      const r = await context().handle(
        new Request(`http://localhost/api${path}`, {
          method,
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(input ? { "content-type": "application/json" } : {}),
          },
          ...(input ? { body: JSON.stringify(input) } : {}),
        }),
      )
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
    const input = (
      key: string,
      form: "COLLECTIVE" | "HOME_VISIT" | "STATIONED" = "COLLECTIVE",
    ) => ({
      projectId,
      teamId,
      title: `B2任务${key}`,
      form,
      kind: "OTHER" as "OTHER" | "INDICATOR",
      pointId,
      location: "测试服务点",
      address: "虚构地址",
      regionCode: "440304",
      startAt: `${day}T09:00:00+08:00`,
      endAt: `${day}T10:00:00+08:00`,
      leaderId: socialId,
      staffIds: [socialId],
      expectedPeople: 10,
      description: "测试服务",
      evidence: "活动照片",
      indicators: [] as Array<{ indicatorId: number; plannedValue: string }>,
      resources: [] as Array<{ resourceId: number; contactId: number; collaboration: string }>,
      requestKey: key,
    })
    const fields = (body: ReturnType<typeof input>) => {
      const { requestKey, ...rest } = body
      void requestKey
      return rest
    }
    const detail = async (id = taskId, token = manager) =>
      (await request(`${base}/${id}`, "GET", token)).data
    beforeAll(async () => {
      Object.assign(env, { devSuperadminUsername: "" })
      const db = context().database
      await grantTaskPermissions(db, true)
      manager = await login("project_manager")
      leader = await login("leader")
      social = await login("social")
      other = await login("other_social")
      admin = await login("admin")
      const users = await db.select().from(s.users),
        orgs = await db.select().from(s.organizations)
      const m = users.find((u) => u.username === "project_manager")!,
        senior = users.find((u) => u.username === "supervisor")!,
        u = users.find((u) => u.username === "social")!,
        l = users.find((u) => u.username === "leader")!
      socialId = u.id
      leaderId = l.id
      teamId = orgs.find((o) => o.code === "demo-team-a")!.id
      const [p] = await db.insert(s.projects).values({
        code: "b2-integration",
        name: "B2执行验收",
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
        partnerName: "虚构合作方",
        startDate: today,
        endDate: end,
        amount: "100",
        serviceArea: "测试区域",
        regionCode: "440304",
      })
      await db.insert(s.projectTeams).values({ projectId, teamId, reporterId: leaderId })
      await db.insert(s.projectMemberships).values(
        [socialId, leaderId].map((userId) => ({
          projectId,
          teamId,
          userId,
          startDate: today,
          endDate: end,
        })),
      )
      const [point] = await db
        .insert(s.projectServicePoints)
        .values({ projectId, name: "测试服务点", address: "虚构地址", regionCode: "440304" })
      pointId = point.insertId
      const [i] = await db.insert(s.projectIndicators).values({
        projectId,
        name: "B2指标",
        unit: "次",
        definition: "测试口径",
        targetValue: "10.01",
        status: "ACTIVE",
      })
      indicatorId = i.insertId
      const [t] = await db
        .insert(s.teamIndicatorTargets)
        .values({ indicatorId, teamId, targetValue: "10.01" })
      targetId = t.insertId
      const [r] = await db.insert(s.resources).values({
        name: "B2合作资源",
        normalizedName: "b2合作资源",
        unitType: "社区",
        region: "测试区域",
        regionCode: "440304",
        ownerOrgId: m.orgId!,
        maintainerId: m.id,
        createdBy: m.id,
      })
      resourceId = r.insertId
      const [c] = await db
        .insert(s.resourceContacts)
        .values({ resourceId, name: "测试联系人", phone: "13900000000" })
      contactId = c.insertId
    })
    test("T03分段精确合计、发布与不可改写", async () => {
      const body = {
        targetId,
        mode: "MILESTONE",
        effectiveDate: today,
        reason: "初始阶段分解",
        periods: [
          { startDate: today, endDate: mid, targetValue: "5.00" },
          { startDate: nextDay(mid), endDate: end, targetValue: "5.01" },
        ],
      }
      expect((await request(plans, "POST", social, body)).code).toBe(2003)
      expect(
        (
          await request(plans, "POST", manager, {
            ...body,
            periods: [body.periods[0], { ...body.periods[1], targetValue: "5.00" }],
          })
        ).code,
      ).toBe(1000)
      const r = await request(plans, "POST", leader, body)
      expect(r.code).toBe(0)
      planId = r.data.id
      expect(
        (await request(`${plans}/${planId}/publish`, "POST", leader, { version: 1 })).code,
      ).toBe(0)
      expect(
        (await request(`${plans}/${planId}`, "PUT", leader, { ...body, version: 2 })).code,
      ).toBe(4000)
      expect((await request(`${plans}/${planId}`, "GET", other)).code).toBe(3000)
      const copied = await request(`${plans}/${planId}/copy`, "POST", manager, {
        effectiveDate: today,
        reason: "调整测试",
      })
      expect(copied.code).toBe(0)
      expect(
        (await request(`${plans}/${copied.data.id}/publish`, "POST", manager, { version: 1 })).code,
      ).toBe(0)
      expect(
        (await request(`${plans}/${planId}`)).data.periods.map(
          (p: { targetValue: string }) => p.targetValue,
        ),
      ).toEqual(["5.00", "5.01"])
    })
    test("T01三类安排、资格、合同日期与团队权限", async () => {
      const b = input("b2-basic")
      let r = await request(base, "POST", leader, b)
      expect(r.code).toBe(0)
      taskId = r.data.id
      for (const changed of [{ regionCode: "440305" }, { address: "伪造同一服务点地址" }])
        expect(
          (
            await request(`${base}/preview`, "POST", manager, {
              ...fields(b),
              ...changed,
              excludeId: taskId,
            })
          ).status,
        ).toBe(409)
      for (const [key, form, hour] of [
        ["visit", "HOME_VISIT", 11],
        ["station", "STATIONED", 13],
      ] as const) {
        r = await request(base, "POST", manager, {
          ...input(key, form),
          startAt: `${day}T${hour}:00:00+08:00`,
          endAt: `${day}T${hour + 1}:00:00+08:00`,
        })
        expect(r.code).toBe(0)
      }
      expect((await request(base, "POST", social, input("social-create"))).code).toBe(2003)
      expect((await request(base, "POST", admin, input("admin-create"))).code).toBe(3000)
      expect((await request(`${base}/${taskId}`, "GET", other)).code).toBe(3000)
      expect(
        (
          await request(base, "POST", manager, {
            ...input("outside"),
            endAt: `${nextDay(end, 1)}T10:00:00+08:00`,
          })
        ).code,
      ).toBe(4000)
      const db = context().database
      await db
        .update(s.projectMemberships)
        .set({ endDate: nextDay(today, 1) })
        .where(eq(s.projectMemberships.userId, socialId))
      expect((await detail()).needsRearrangement).toBe(true)
      expect((await request(base, "POST", manager, input("member-invalid"))).code).toBe(4000)
      await db
        .update(s.projectMemberships)
        .set({ endDate: end })
        .where(eq(s.projectMemberships.userId, socialId))
      const u = (await db.select().from(s.users).where(eq(s.users.id, socialId)))[0]!
      await db.update(s.users).set({ status: "DISABLED" }).where(eq(s.users.id, socialId))
      expect((await request(base, "POST", manager, input("disabled"))).code).toBe(4000)
      await db.update(s.users).set({ status: u.status }).where(eq(s.users.id, socialId))
    })
    test("T02冲突指纹变化、相邻时间、改期与取消留痕", async () => {
      const body = fields(input("conflict")),
        preview = (await request(`${base}/preview`, "POST", manager, body)).data
      expect(preview.conflicts.length).toBeGreaterThan(0)
      expect(
        (await request(base, "POST", manager, { ...body, requestKey: "unconfirmed" })).code,
      ).toBe(4000)
      const old = await detail()
      expect(
        (
          await request(`${base}/${taskId}`, "PUT", manager, {
            ...body,
            title: "冲突对象已变更",
            version: old.version,
            reason: "更新安排",
          })
        ).code,
      ).toBe(0)
      expect(
        (
          await request(base, "POST", manager, {
            ...body,
            requestKey: "stale-confirm",
            previewToken: preview.previewToken,
            conflictReason: "已协调",
          })
        ).code,
      ).toBe(4000)
      const fresh = (await request(`${base}/preview`, "POST", manager, body)).data
      expect(
        (
          await request(base, "POST", manager, {
            ...body,
            requestKey: "confirmed",
            previewToken: fresh.previewToken,
            conflictReason: "现场分工已协调",
          })
        ).code,
      ).toBe(0)
      const adjacent = { ...body, startAt: `${day}T10:00:00+08:00`, endAt: `${day}T11:00:00+08:00` }
      expect(
        (await request(`${base}/preview`, "POST", manager, adjacent)).data.conflicts,
      ).toHaveLength(0)
      const t = await detail()
      expect(
        (
          await request(`${base}/${taskId}/cancel`, "POST", leader, {
            version: t.version,
            reason: "服务改期",
          })
        ).code,
      ).toBe(0)
      const canceled = await detail()
      expect(canceled.executable).toBe(false)
      expect(canceled.events.at(-1).action).toBe("CANCEL")
      expect(
        (
          await request(`${base}/${taskId}`, "PUT", manager, {
            ...body,
            version: canceled.version,
            reason: "改期",
          })
        ).code,
      ).toBe(4000)
    })
    test("T02四周批量幂等、列表日历一致与取消任务复制", async () => {
      let wed = nextDay(today, 1)
      while (new Date(wed).getUTCDay() !== 3) wed = nextDay(wed)
      const b = {
        ...input("four-wednesdays"),
        startAt: `${wed}T15:00:00+08:00`,
        endAt: `${wed}T16:00:00+08:00`,
        recurrence: { frequency: "WEEKLY", until: nextDay(wed, 21), weekdays: [3] },
      }
      const r = await request(`${base}/batch`, "POST", leader, b)
      expect(r.code).toBe(0)
      expect(r.data.ids).toHaveLength(4)
      expect(new Set(r.data.ids).size).toBe(4)
      expect((await request(`${base}/batch`, "POST", leader, b)).data.ids).toEqual(r.data.ids)
      expect(
        (await request(`${base}/batch`, "POST", leader, { ...b, title: "changed" })).code,
      ).toBe(4000)
      const list = (
        await request(
          `${base}?projectId=${projectId}&from=${wed}&to=${nextDay(wed, 21)}&pageSize=100`,
        )
      ).data.list
      const cal = (
        await request(`${base}/calendar?projectId=${projectId}&from=${wed}&to=${nextDay(wed, 21)}`)
      ).data.list
      expect(cal.map((t: { id: number }) => t.id)).toEqual(list.map((t: { id: number }) => t.id))
      const copied = await request(`${base}/${taskId}/copy`, "POST", manager, {
        ...input("copy-canceled"),
        startAt: `${day}T17:00:00+08:00`,
        endAt: `${day}T18:00:00+08:00`,
      })
      expect(copied.code).toBe(0)
      expect((await detail(copied.data.id)).sourceTaskId).toBe(taskId)
    })
    test("T04资源联系人裁剪、归档提醒与超量确认", async () => {
      const body = {
        ...fields(input("resource")),
        startAt: `${day}T19:00:00+08:00`,
        endAt: `${day}T20:00:00+08:00`,
        kind: "INDICATOR",
        indicators: [{ indicatorId, plannedValue: "6.00" }],
        resources: [{ resourceId, contactId, collaboration: "已确认场地档期" }],
      }
      const p = (await request(`${base}/preview`, "POST", manager, body)).data
      expect(p.warnings).toHaveLength(1)
      const r = await request(base, "POST", manager, {
        ...body,
        requestKey: "resource-indicator",
        previewToken: p.previewToken,
        conflictReason: "按服务需要预留余量",
      })
      expect(r.code).toBe(0)
      const full = await detail(r.data.id)
      expect(full.resources[0].contact.phone).toBe("13900000000")
      const redacted = await detail(r.data.id, social)
      expect(redacted.resources[0].resourceId).toBeNull()
      expect(redacted.resources[0].contact).toBeNull()
      expect(JSON.stringify(redacted)).not.toContain("13900000000")
      await context()
        .database.update(s.resources)
        .set({ status: "ARCHIVED" })
        .where(eq(s.resources.id, resourceId))
      expect((await detail(r.data.id)).resources[0].needsReview).toBe(true)
      expect(
        (await request(base, "POST", manager, { ...body, requestKey: "archived-resource" })).code,
      ).toBe(3000)
      expect(
        (
          await request(
            `/service/contract-package-projects/${projectId}/service-points`,
            "PUT",
            manager,
            { version: 1, points: [] },
          )
        ).code,
      ).not.toBe(0)
    })
    test("T04资源合并后保留任务来源且重新裁剪迁移的联系人", async () => {
      const db = context().database,
        m = (await db.select().from(s.users)).find((u) => u.username === "project_manager")!
      const create = async (name: string) =>
        (
          await request("/resources", "POST", manager, {
            name,
            unitType: "社区",
            region: "测试",
            regionCode: "440304",
            ownerOrgId: m.orgId,
            maintainerId: m.id,
          })
        ).data.id as number
      const sourceId = await create("B2合并来源"),
        targetId = await create("B2合并目标")
      const contact = (
        await request(`/resources/${sourceId}/contacts`, "POST", manager, {
          name: "迁移联系人",
          phone: "13888888888",
          isPrimary: false,
          status: "ACTIVE",
        })
      ).data.id
      const task = await request(base, "POST", manager, {
        ...input("merge-resource-task"),
        startAt: `${nextDay(today, 3)}T09:00:00+08:00`,
        endAt: `${nextDay(today, 3)}T10:00:00+08:00`,
        resources: [{ resourceId: sourceId, contactId: contact, collaboration: "合并来源保留" }],
      })
      expect(task.code).toBe(0)
      expect((await detail(task.data.id)).resources[0].contact.phone).toBe("13888888888")
      const source = (await request(`/resources/${sourceId}`)).data,
        target = (await request(`/resources/${targetId}`)).data
      expect(
        (
          await request("/resources/merge", "POST", admin, {
            sourceId,
            targetId,
            sourceVersion: source.version,
            targetVersion: target.version,
            reason: "核对重复单位",
          })
        ).code,
      ).toBe(0)
      const saved = await detail(task.data.id)
      expect(saved.resources[0].resourceName).toBe("B2合并来源")
      expect(saved.resources[0].needsReview).toBe(true)
      expect(saved.resources[0].contact).toBeNull()
      expect(JSON.stringify(saved)).not.toContain("13888888888")
    })
    test("T03目标变更旧版留存、新安排拒绝与草稿发布再校验", async () => {
      const db = context().database
      const draft = await request(`${plans}/${planId}/copy`, "POST", manager, {
        effectiveDate: today,
        reason: "目标变更前草稿",
      })
      expect(draft.code).toBe(0)
      await db
        .update(s.teamIndicatorTargets)
        .set({ targetValue: "12.01", version: sql`${s.teamIndicatorTargets.version}+1` })
        .where(eq(s.teamIndicatorTargets.id, targetId))
      expect(
        (await request(`${plans}/${draft.data.id}/publish`, "POST", manager, { version: 1 })).code,
      ).toBe(4000)
      const old = (await request(`${plans}/${planId}`)).data
      expect(old.stale).toBe(true)
      expect(old.targetValue).toBe("10.01")
      expect(
        (
          await request(base, "POST", manager, {
            ...input("stale-plan"),
            kind: "INDICATOR",
            indicators: [{ indicatorId, plannedValue: "1.00" }],
          })
        ).code,
      ).toBe(4000)
      const copied = await request(`${plans}/${planId}/copy`, "POST", manager, {
        effectiveDate: today,
        reason: "按新目标重新分解",
      })
      expect(copied.code).toBe(0)
      expect(
        (await request(`${plans}/${copied.data.id}`)).data.periods.map(
          (p: { targetValue: string }) => p.targetValue,
        ),
      ).toEqual(["6.00", "6.01"])
    })
    test("T03已结束阶段锁定、回溯生效与区间空档拒绝", async () => {
      const db = context().database,
        users = await db.select().from(s.users),
        m = users.find((u) => u.username === "project_manager")!,
        senior = users.find((u) => u.username === "supervisor")!
      const start = nextDay(today, -30),
        stop = nextDay(today, 10)
      const [p] = await db.insert(s.projects).values({
        code: "b2-history",
        name: "历史基线验收",
        ownerOrgId: m.orgId!,
        directorId: m.id,
        seniorDirectorId: senior.id,
        serviceFieldCode: "社区建设",
        status: "ACTIVE",
        createdBy: m.id,
      })
      await db.insert(s.projectContracts).values({
        projectId: p.insertId,
        partnerName: "历史合同",
        startDate: start,
        endDate: stop,
        amount: "1",
        serviceArea: "测试",
        regionCode: "440304",
      })
      await db
        .insert(s.projectTeams)
        .values({ projectId: p.insertId, teamId, reporterId: leaderId })
      const [i] = await db.insert(s.projectIndicators).values({
        projectId: p.insertId,
        name: "历史指标",
        unit: "次",
        definition: "历史验收",
        targetValue: "10.01",
        status: "ACTIVE",
      })
      const [t] = await db
        .insert(s.teamIndicatorTargets)
        .values({ indicatorId: i.insertId, teamId, targetValue: "10.01" })
      const body = {
        targetId: t.insertId,
        mode: "MILESTONE",
        effectiveDate: today,
        reason: "保存历史基线",
        periods: [
          { startDate: start, endDate: nextDay(today, -1), targetValue: "5.00" },
          { startDate: today, endDate: stop, targetValue: "5.01" },
        ],
      }
      const r = await request(plans, "POST", manager, body)
      expect(r.code).toBe(0)
      expect(
        (await request(`${plans}/${r.data.id}/publish`, "POST", manager, { version: 1 })).code,
      ).toBe(0)
      expect(
        (
          await request(plans, "POST", manager, {
            ...body,
            reason: "改写历史",
            periods: [
              { ...body.periods[0], targetValue: "4.99" },
              { ...body.periods[1], targetValue: "5.02" },
            ],
          })
        ).code,
      ).toBe(4000)
      expect(
        (await request(plans, "POST", manager, { ...body, effectiveDate: nextDay(today, -1) }))
          .code,
      ).toBe(1000)
      expect(
        (
          await request(plans, "POST", manager, {
            ...body,
            periods: [body.periods[0], { ...body.periods[1], startDate: nextDay(today, 1) }],
          })
        ).code,
      ).toBe(1000)
      const c = await request(`${plans}/${r.data.id}/copy`, "POST", manager, {
        effectiveDate: today,
        reason: "保持历史的新版本",
      })
      expect(c.code).toBe(0)
      expect((await request(`${plans}/${c.data.id}`)).data.periods[0].targetValue).toBe("5.00")
    })
    test("T01跨项目人员冲突只返回通用提示", async () => {
      const db = context().database,
        users = await db.select().from(s.users),
        senior = users.find((u) => u.username === "supervisor")!,
        department = users.find((u) => u.username === "department")!
      const [p] = await db.insert(s.projects).values({
        code: "b2-hidden",
        name: "受限项目题名",
        ownerOrgId: department.orgId!,
        directorId: department.id,
        seniorDirectorId: senior.id,
        serviceFieldCode: "社区建设",
        status: "ACTIVE",
        createdBy: department.id,
      })
      const startAt = new Date(`${nextDay(today, 10)}T16:00:00+08:00`),
        endAt = new Date(`${nextDay(today, 10)}T17:00:00+08:00`)
      const [t] = await db.insert(s.serviceTasks).values({
        projectId: p.insertId,
        teamId,
        title: "受限任务秘密题名",
        form: "STATIONED",
        kind: "OTHER",
        location: "受限场所",
        address: "",
        regionCode: "440304",
        startAt,
        endAt,
        leaderId: senior.id,
        expectedPeople: 0,
        description: "",
        evidence: "",
        createdBy: department.id,
        requestKey: "hidden-fixture",
        batchIndex: 0,
        batchFingerprint: "fixture",
      })
      await db.insert(s.serviceTaskStaff).values({ taskId: t.insertId, userId: senior.id })
      const body = {
        ...fields(input("hidden-conflict")),
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        staffIds: [senior.id],
        leaderId: senior.id,
      }
      const preview = (await request(`${base}/preview`, "POST", manager, body)).data
      expect(preview.conflicts).toHaveLength(1)
      expect(preview.conflicts[0].taskId).toBeNull()
      expect(preview.conflicts[0].startAt).toBeNull()
      expect(JSON.stringify(preview)).not.toContain("受限任务秘密题名")
      expect((await request(`${base}/${t.insertId}`, "GET", manager)).code).toBe(3000)
    })
    test("T02并发同请求只保留一个任务，旧版本改动拒绝", async () => {
      const b = {
        ...input("concurrent-request"),
        startAt: `${day}T21:00:00+08:00`,
        endAt: `${day}T22:00:00+08:00`,
      }
      const results = await Promise.all([
        request(base, "POST", manager, b),
        request(base, "POST", manager, b),
      ])
      expect(results.map((r) => r.code)).toEqual([0, 0])
      expect(results[0].data.id).toBe(results[1].data.id)
      const t = await detail(results[0].data.id)
      const update = {
        ...fields(b),
        staffIds: [leaderId],
        leaderId,
        version: t.version,
        reason: "换人",
      }
      expect((await request(`${base}/${t.id}`, "PUT", leader, update)).code).toBe(0)
      expect((await request(`${base}/${t.id}`, "PUT", leader, update)).code).toBe(4000)
      const changed = await detail(t.id)
      expect(changed.staffIds).toEqual([leaderId])
      expect(changed.events.at(-1).beforeData.staffNames.length).toBe(1)
    })
    test("T02批次后项写入故障回滚所有任务、子项、事件与审计", async () => {
      const db = context().database
      class Failing extends ProjectRepository {
        override write<T>(
          actor: Actor,
          work: (tx: BusinessConnection, data: BusinessState, current: Actor) => Promise<T>,
        ) {
          return super.write(actor, async (tx, data, current) => {
            const original = tx.scheduling.events.insert
            let count = 0
            tx.scheduling.events.insert = async (value) => {
              if (++count === 2) throw new Error("B2 rollback probe")
              return original(value)
            }
            return work(tx, data, current)
          })
        }
      }
      const identity = new IdentityService(new IdentityRepository(db)),
        user = await new IdentityRepository(db).findUsername("project_manager"),
        actor = await identity.actor(user!.id)
      const before = await db.select().from(s.serviceTasks),
        events = await db.select().from(s.serviceTaskEvents),
        logs = await db.select().from(s.auditLogs)
      const b = {
        ...input("rollback-batch"),
        startAt: `${nextDay(today, 40)}T09:00:00+08:00`,
        endAt: `${nextDay(today, 40)}T10:00:00+08:00`,
        recurrence: { frequency: "DAILY" as const, until: nextDay(today, 42) },
      }
      let failure: unknown
      try {
        await new TaskService(new Failing(db)).create(actor, b)
      } catch (error) {
        failure = error
      }
      expect(failure).toBeInstanceOf(Error)
      expect((failure as Error).message).toContain("rollback probe")
      expect((await db.select().from(s.serviceTasks)).length).toBe(before.length)
      expect((await db.select().from(s.serviceTaskEvents)).length).toBe(events.length)
      expect((await db.select().from(s.auditLogs)).length).toBe(logs.length)
      expect(
        (
          await request(base, "POST", manager, {
            ...b,
            recurrence: undefined,
            requestKey: "single-after-rollback",
          })
        ).code,
      ).toBe(0)
    })
  })
}
