import { beforeAll, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import * as s from "@/db/schema"
import type { Database } from "@/modules/identity/identity.repository"
import { IdentityRepository } from "@/modules/identity/identity.repository"
import { IdentityService } from "@/modules/identity/identity.service"
import {
  ProjectRepository,
  type BusinessConnection,
  type BusinessState,
} from "@/modules/project/project.repository"
import type { Actor } from "@/utils/authorization"
import { businessDate, nextDay } from "@/modules/task/task-calendar"
import { env } from "@/utils/env"
import { grantExecutionPermissions } from "./execution.seed"
import { ExecutionService } from "./execution.service"
import { EvidenceService } from "./evidence.service"
import { readdir } from "node:fs/promises"
import { credentialHash } from "./credential.service"

export function registerExecutionTests(
  context: () => {
    database: Database
    handle: (r: Request) => Response | Promise<Response>
    setClock: (at: Date) => void
  },
) {
  describe("B3现场执行与核验", () => {
    let manager = "",
      social = "",
      leader = "",
      other = "",
      admin = ""
    let projectId = 0,
      teamId = 0,
      socialId = 0,
      leaderId = 0,
      pointId = 0,
      taskId = 0
    let clock = new Date(),
      serial = 0
    const today = businessDate(),
      day = nextDay(today, 1)
    const at = (time: string) => new Date(`${day}T${time}:00+08:00`)
    function set(time: string) {
      clock = at(time)
      context().setClock(clock)
    }
    const key = () => `b3-${++serial}`
    async function request(path: string, method = "GET", token = social, body?: unknown) {
      const response = await context().handle(
        new Request(`http://localhost/api${path}`, {
          method,
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body ? { "content-type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      )
      return { status: response.status, headers: response.headers, ...(await response.json()) }
    }
    const base = (id: number) => `/service/tasks/${id}/execution`
    const detail = async (id = taskId, token = social) =>
      (await request(base(id), "GET", token)).data
    const geo = () => ({
      status: "OK" as const,
      latitude: 23,
      longitude: 113,
      accuracy: 12,
      sampledAt: clock.toISOString(),
    })
    async function payload(id = taskId) {
      return {
        requestKey: key(),
        sourceVersion: (await detail(id)).sourceVersion,
        declaredAt: clock.toISOString(),
        geo: geo(),
        reason: "",
        evidenceIds: [] as number[],
      }
    }
    async function create(form = "COLLECTIVE", staffIds = [socialId, leaderId]) {
      const body = {
        projectId,
        teamId,
        title: `B3服务${key()}`,
        form,
        kind: "OTHER",
        pointId,
        location: "虚构社区",
        address: "测试地址",
        regionCode: "440304",
        startAt: at("10:00").toISOString(),
        endAt: at("11:00").toISOString(),
        leaderId: socialId,
        staffIds,
        expectedPeople: 8,
        description: "现场测试",
        evidence: "参与来源",
        indicators: [],
        resources: [],
      }
      const preview = await request("/service/tasks/preview", "POST", manager, body)
      expect(preview.code).toBe(0)
      const r = await request("/service/tasks", "POST", manager, {
        ...body,
        requestKey: key(),
        previewToken: preview.data.previewToken,
        conflictReason: "测试不同服务场景的独立来源",
      })
      expect(r.code).toBe(0)
      await context()
        .database.update(s.serviceTasks)
        .set({ executionMode: "LEGACY" })
        .where(eq(s.serviceTasks.id, r.data.id))
      const d = await detail(r.data.id, manager)
      const configured = await request(`${base(r.data.id)}/policy`, "PUT", manager, {
        ...d.policy,
        locationCheckEnabled: true,
        version: d.policyVersion,
        taskVersion: d.taskVersion,
        reason: "原定位策略回归场景",
      })
      expect(configured.code).toBe(0)
      return r.data.id as number
    }
    async function roster(id = taskId, count = 1) {
      const ids: number[] = []
      for (let i = 0; i < count; i++) {
        const b = {
          taskId: id,
          projectId,
          name: `测试对象${key()}`,
          phone: "13900000001",
          requestKey: key(),
        }
        const p = await request("/service/participants", "POST", social, b)
        expect(p.code).toBe(0)
        expect((await request("/service/participants", "POST", social, b)).data.id).toBe(p.data.id)
        const r = await request(`${base(id)}/participants`, "POST", social, {
          participantId: p.data.id,
        })
        expect(r.code).toBe(0)
        ids.push(r.data.id)
      }
      return ids
    }
    async function issue(id: number, rosterId: number, purpose = "COLLECTIVE") {
      const b = {
        rosterId,
        purpose,
        requestKey: key(),
        sourceVersion: (await detail(id)).sourceVersion,
      }
      const r = await request(`${base(id)}/credentials`, "POST", social, b)
      expect(r.code).toBe(0)
      expect((await request(`${base(id)}/credentials`, "POST", social, b)).data.token).toBe(
        r.data.token,
      )
      return r.data as { id: number; token: string }
    }
    async function upload(id: number, name = "测试.pdf", bytes = "%PDF-1.4\nB3 evidence\n%%EOF") {
      const body = new FormData()
      body.append("file", new File([bytes], name))
      body.append("requestKey", key())
      const r = await context().handle(
        new Request(`http://localhost/api${base(id)}/evidence`, {
          method: "POST",
          headers: { Authorization: `Bearer ${social}` },
          body,
        }),
      )
      return { status: r.status, ...(await r.json()) }
    }
    beforeAll(async () => {
      const db = context().database
      Object.assign(env, { devSuperadminUsername: "" })
      await grantExecutionPermissions(db, true)
      async function login(name: string) {
        const r = await request("/auth/login", "POST", "", {
          username: name,
          password: "IdentityTest_2026",
        })
        expect(r.code).toBe(0)
        return r.data.token as string
      }
      manager = await login("project_manager")
      social = await login("social")
      leader = await login("leader")
      other = await login("other_social")
      admin = await login("admin")
      const users = await db.select().from(s.users),
        orgs = await db.select().from(s.organizations)
      const m = users.find((u) => u.username === "project_manager")!,
        senior = users.find((u) => u.username === "supervisor")!
      socialId = users.find((u) => u.username === "social")!.id
      leaderId = users.find((u) => u.username === "leader")!.id
      teamId = orgs.find((o) => o.code === "demo-team-a")!.id
      const [p] = await db.insert(s.projects).values({
        code: "b3-integration",
        name: "B3现场服务",
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
        endDate: nextDay(today, 10),
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
          endDate: nextDay(today, 10),
        })),
      )
      const [point] = await db.insert(s.projectServicePoints).values({
        projectId,
        name: "测试参考点",
        address: "测试地址",
        regionCode: "440304",
        latitude: 23,
        longitude: 113,
        radius: 200,
      })
      pointId = point.insertId
      set("10:00")
      taskId = await create()
    })
    test("V01真实分派、原子开场与规则快照，取消及安排变更锁定", async () => {
      const input = await payload()
      expect((await request(`${base(taskId)}/start`, "POST", manager, input)).code).toBe(2003)
      expect((await request(`${base(taskId)}/start`, "POST", admin, input)).code).not.toBe(0)
      const results = await Promise.all([
        request(`${base(taskId)}/start`, "POST", social, input),
        request(`${base(taskId)}/start`, "POST", social, input),
      ])
      expect(results.map((r) => r.code)).toEqual([0, 0])
      expect(results[0].data.id).toBe(results[1].data.id)
      const d = await detail()
      expect(d.state).toBe("IN_PROGRESS")
      expect(d.attendance.length).toBe(1)
      const session = (
        await context()
          .database.select()
          .from(s.executionSessions)
          .where(eq(s.executionSessions.taskId, taskId))
      )[0]
      expect(session.snapshot.staff.map((u) => u.userId)).toEqual([socialId, leaderId])
      expect(session.snapshot.policy.latitude).toBe(23)
      expect(
        (
          await request(`/service/tasks/${taskId}/cancel`, "POST", manager, {
            version: d.taskVersion,
            reason: "测试",
          })
        ).code,
      ).toBe(4000)
      const { pointId: ignored, pointVersion: ignoredVersion, ...policy } = d.policy
      void ignored
      void ignoredVersion
      expect(
        (
          await request(`${base(taskId)}/policy`, "PUT", manager, {
            ...policy,
            version: d.policyVersion,
            taskVersion: d.taskVersion,
            reason: "测试锁定",
          })
        ).code,
      ).toBe(4000)
      expect((await request(base(taskId), "GET", other)).status).toBe(404)
      expect(
        (
          await request(`${base(taskId)}/attendance`, "POST", leader, {
            ...(await payload()),
            kind: "CHECK_OUT",
            method: "NORMAL",
          })
        ).code,
      ).toBe(4000)
    })
    test("V02八张个人参与卡、公开裁剪、并发重试只形成八条参与事实", async () => {
      const before = (await context().database.select().from(s.monthlyReports)).length
      const ids = await roster(taskId, 8),
        tokens: string[] = []
      for (const id of ids) tokens.push((await issue(taskId, id)).token)
      const page = await request("/execution/participation/resolve", "POST", "", {
        token: tokens[0],
      })
      expect(page.code).toBe(0)
      expect(Object.keys(page.data).sort()).toEqual(
        ["canConfirm", "date", "expiresAt", "name", "purpose", "recorded", "title"].sort(),
      )
      expect(page.data.name).not.toContain("测试对象")
      expect(page.headers.get("cache-control")).toBe("no-store")
      const raw = (await context().database.select().from(s.executionCredentials)).find(
        (c) => c.tokenHash === credentialHash(tokens[0]),
      )!
      expect(JSON.stringify(raw)).not.toContain(tokens[0])
      const confirms = await Promise.all(
        tokens.flatMap((token) => {
          const b = { token, requestKey: key(), confirmerRole: "SELF", relation: "" }
          return [
            request("/execution/participation/confirm", "POST", "", b),
            request("/execution/participation/confirm", "POST", "", b),
          ]
        }),
      )
      expect(confirms.every((r) => r.code === 0)).toBe(true)
      const d = await detail()
      expect(d.summary.registered).toBe(8)
      expect(d.participationEvents.length).toBe(8)
      expect((await context().database.select().from(s.monthlyReports)).length).toBe(before)
      expect(
        (await request("/execution/participation/resolve", "POST", "", { token: "a".repeat(43) }))
          .status,
      ).toBe(404)
      expect(
        (
          await request("/execution/participation/confirm", "POST", "", {
            token: tokens[0],
            requestKey: key(),
            confirmerRole: "FAMILY",
            relation: "家属",
          })
        ).code,
      ).not.toBe(0)
      const change = {
        requestKey: key(),
        sourceVersion: (await detail()).sourceVersion,
        kind: "CORRECT",
        method: "ASSISTED",
        confirmerRole: "STAFF",
        relation: "",
        reason: "八人样例中的辅助来源复核",
        occurredAt: clock.toISOString(),
        evidenceIds: [],
      }
      expect(
        (await request(`${base(taskId)}/participants/${ids[7]}/confirm`, "POST", social, change))
          .code,
      ).toBe(0)
      expect((await detail()).summary.registered).toBe(8)
      expect((await detail()).summary.requiresReview).toBe(1)
      const invalid = {
        ...change,
        kind: "VOID",
        requestKey: key(),
        sourceVersion: (await detail()).sourceVersion,
        reason: "核对后作废本次参与",
      }
      expect(
        (await request(`${base(taskId)}/participants/${ids[7]}/void`, "POST", social, invalid))
          .code,
      ).toBe(0)
      expect(
        (await request(`${base(taskId)}/participants/${ids[7]}/void`, "POST", social, invalid))
          .code,
      ).toBe(0)
      expect((await detail()).summary.registered).toBe(7)
      const renewed = await issue(taskId, ids[7]!)
      expect(
        (
          await request("/execution/participation/confirm", "POST", "", {
            token: renewed.token,
            requestKey: key(),
            confirmerRole: "SELF",
            relation: "",
          })
        ).code,
      ).toBe(0)
      const final = await detail()
      expect(final.summary.registered).toBe(8)
      expect(final.participationEvents.length).toBe(11)
      expect((await context().database.select().from(s.monthlyReports)).length).toBe(before)
    })
    test("V03拒绝定位留痕、本人和主管异常范围、说明幂等与签退解决缺失", async () => {
      set("10:20")
      const b = {
        ...(await payload()),
        kind: "CHECK_IN",
        method: "NORMAL",
        geo: { status: "DENIED" },
        reason: "设备拒绝定位，已到服务现场",
      }
      expect((await request(`${base(taskId)}/attendance`, "POST", leader, b)).code).toBe(0)
      expect((await request(`${base(taskId)}/attendance`, "POST", leader, b)).code).toBe(0)
      let d = await detail()
      const event = d.attendance.find((e: { userId: number }) => e.userId === leaderId)
      expect(event.flags).toEqual(["LOCATION_DENIED", "LATE"])
      const own = await request("/execution/exceptions", "GET", leader),
        hidden = await request("/execution/exceptions", "GET", other)
      const e = own.data.find(
        (e: { code: string; taskId: number }) =>
          e.taskId === taskId && e.code === "LOCATION_DENIED",
      )
      expect(e).toBeDefined()
      expect(hidden.data.some((e: { taskId: number }) => e.taskId === taskId)).toBe(false)
      const note = {
        version: e.version,
        reason: "现场核对补充说明",
        requestKey: key(),
        evidenceIds: [],
      }
      expect(
        (await request(`/execution/exceptions/${e.id}/notes`, "POST", leader, note)).code,
      ).toBe(0)
      expect(
        (await request(`/execution/exceptions/${e.id}/notes`, "POST", leader, note)).code,
      ).toBe(0)
      expect(
        (await request(`/execution/exceptions/${e.id}/notes`, "POST", social, note)).status,
      ).toBe(404)
      set("11:00")
      expect((await request(`${base(taskId)}/end`, "POST", social, await payload())).code).toBe(0)
      d = await detail()
      expect(d.session.status).toBe("ENDED")
      expect(d.canRecord).toBe(false)
      expect(d.canManageParticipants).toBe(false)
      expect(d.exceptions.some((e: { code: string }) => e.code === "MISSING_CHECKOUT")).toBe(true)
      set("11:05")
      expect(
        (
          await request(`${base(taskId)}/attendance`, "POST", leader, {
            ...(await payload()),
            kind: "CHECK_OUT",
            method: "NORMAL",
          })
        ).code,
      ).toBe(0)
      d = await detail()
      expect(d.exceptions.find((e: { code: string }) => e.code === "MISSING_CHECKOUT").status).toBe(
        "RESOLVED",
      )
    })
    test("V04原始到离保持、显式更正链与72小时截止", async () => {
      set("12:00")
      const d = await detail(),
        original = d.attendance.find(
          (e: { userId: number; kind: string }) => e.userId === socialId && e.kind === "CHECK_IN",
        )
      const b = {
        ...(await payload()),
        kind: "CHECK_IN",
        method: "CORRECTION",
        declaredAt: at("09:59").toISOString(),
        supersedesId: original.id,
        reason: "补充核对实际到岗时间",
        geo: { status: "UNAVAILABLE" },
      }
      expect((await request(`${base(taskId)}/attendance`, "POST", social, b)).code).toBe(0)
      expect((await request(`${base(taskId)}/attendance`, "POST", social, b)).code).toBe(0)
      const after = await detail()
      expect(after.attendance.length).toBe(d.attendance.length + 1)
      expect(after.attendance.find((e: { id: number }) => e.id === original.id).current).toBe(false)
      expect(after.attendance.at(-1).flags).toContain("CORRECTION")
      context().setClock(new Date(at("11:00").getTime() + 73 * 3600000))
      expect(
        (
          await request(`${base(taskId)}/attendance`, "POST", social, {
            ...b,
            requestKey: key(),
            sourceVersion: after.sourceVersion,
          })
        ).code,
      ).not.toBe(0)
      set("10:00")
    })
    test("V05入户家属关系、辅助替代凭证、下载范围及绑定历史", async () => {
      const id = await create("HOME_VISIT"),
        [r1, r2] = await roster(id, 2)
      expect((await request(`${base(id)}/start`, "POST", social, await payload(id))).code).toBe(0)
      const c = await issue(id, r1, "HOME_CONFIRM")
      expect(
        (
          await request("/execution/participation/confirm", "POST", "", {
            token: c.token,
            requestKey: key(),
            confirmerRole: "FAMILY",
            relation: "",
          })
        ).code,
      ).toBe(1000)
      expect(
        (
          await request("/execution/participation/confirm", "POST", "", {
            token: c.token,
            requestKey: key(),
            confirmerRole: "FAMILY",
            relation: "女儿",
          })
        ).code,
      ).toBe(0)
      const b = {
        sourceVersion: (await detail(id)).sourceVersion,
        requestKey: key(),
        kind: "CONFIRM",
        method: "ASSISTED",
        confirmerRole: "STAFF",
        relation: "",
        reason: "对象无法操作手机，现场辅助",
        occurredAt: clock.toISOString(),
        evidenceIds: [] as number[],
      }
      expect(
        (await request(`${base(id)}/participants/${r2}/confirm`, "POST", social, b)).code,
      ).toBe(1000)
      expect((await upload(id, "假图.png", "invalid")).code).toBe(1000)
      const file = await upload(id)
      expect(file.code).toBe(0)
      expect(file.data.sha256.length).toBe(64)
      expect(file.data.storageKey).toBeUndefined()
      expect(
        (
          await request(`${base(id)}/participants/${r2}/confirm`, "POST", social, {
            ...b,
            evidenceIds: [file.data.id],
          })
        ).code,
      ).toBe(0)
      const download = await context().handle(
        new Request(`http://localhost/api/execution/evidence/${file.data.id}/download`, {
          headers: { Authorization: `Bearer ${social}` },
        }),
      )
      expect(download.status).toBe(200)
      expect(await download.text()).toContain("B3 evidence")
      expect(
        (await request(`/execution/evidence/${file.data.id}/download`, "GET", other)).status,
      ).toBe(404)
      expect((await request(`/execution/evidence/${file.data.id}`, "DELETE")).code).toBe(4000)
      expect((await detail(id)).summary.requiresReview).toBe(1)
    })
    test("V06重发、过期、中止撤销与取消后的普通签到拦截", async () => {
      const id = await create(),
        [r] = await roster(id)
      expect((await request(`${base(id)}/start`, "POST", social, await payload(id))).code).toBe(0)
      const c1 = await issue(id, r),
        c2 = await issue(id, r)
      expect(
        (await request("/execution/participation/resolve", "POST", "", { token: c1.token })).status,
      ).toBe(404)
      set("10:31")
      expect(
        (await request("/execution/participation/resolve", "POST", "", { token: c2.token })).status,
      ).toBe(404)
      const c3 = await issue(id, r),
        b = {
          sourceVersion: (await detail(id)).sourceVersion,
          requestKey: key(),
          reason: "天气原因中止",
        }
      Object.assign(env, { devSuperadminUsername: "admin" })
      try {
        expect((await request(`${base(id)}/stop`, "POST", admin, b)).code).toBe(2003)
      } finally {
        Object.assign(env, { devSuperadminUsername: "" })
      }
      expect((await request(`${base(id)}/stop`, "POST", manager, b)).code).toBe(0)
      expect((await request(`${base(id)}/stop`, "POST", manager, b)).code).toBe(0)
      expect(
        (await request("/execution/participation/resolve", "POST", "", { token: c3.token })).status,
      ).toBe(404)
      expect(
        (
          await request(`${base(id)}/attendance`, "POST", leader, {
            ...(await payload(id)),
            kind: "CHECK_IN",
            method: "NORMAL",
          })
        ).code,
      ).toBe(4000)
      expect((await detail(id)).state).toBe("CANCELED")
      set("10:00")
    })
    test("V01点位版本变化须重新核对，窗口外与禁用身份拒绝", async () => {
      const id = await create(),
        d = await detail(id),
        { pointId: ignored, pointVersion: ignoredVersion, ...policy } = d.policy
      void ignored
      void ignoredVersion
      expect(
        (
          await request(`${base(id)}/policy`, "PUT", manager, {
            ...policy,
            version: d.policyVersion,
            taskVersion: d.taskVersion,
            reason: "核对点位",
          })
        ).code,
      ).toBe(0)
      await context()
        .database.update(s.projectServicePoints)
        .set({ version: 2 })
        .where(eq(s.projectServicePoints.id, pointId))
      expect((await request(`${base(id)}/start`, "POST", social, await payload(id))).code).toBe(
        4000,
      )
      const newer = await detail(id)
      expect(
        (
          await request(`${base(id)}/policy`, "PUT", manager, {
            ...policy,
            version: newer.policyVersion,
            taskVersion: newer.taskVersion,
            reason: "重新核对",
          })
        ).code,
      ).toBe(0)
      set("08:00")
      expect((await request(`${base(id)}/start`, "POST", social, await payload(id))).code).not.toBe(
        0,
      )
      set("10:00")
      await context()
        .database.update(s.users)
        .set({ status: "DISABLED" })
        .where(eq(s.users.id, socialId))
      expect(
        (
          await request(`${base(id)}/start`, "POST", social, {
            requestKey: key(),
            sourceVersion: 0,
            declaredAt: clock.toISOString(),
            geo: geo(),
            reason: "",
            evidenceIds: [],
          })
        ).code,
      ).not.toBe(0)
      await context()
        .database.update(s.users)
        .set({ status: "ACTIVE" })
        .where(eq(s.users.id, socialId))
    })
    test("V05文件元数据失败清理磁盘、绑定失败回滚事件，文件上限与他人文件校验", async () => {
      set("10:00")
      const id = await create(),
        [r] = await roster(id),
        db = context().database
      expect((await request(`${base(id)}/start`, "POST", social, await payload(id))).code).toBe(0)
      const file = await upload(id)
      expect(file.code).toBe(0)
      const eventBefore = (await db.select().from(s.participationEvents)).length
      const b = {
        requestKey: key(),
        sourceVersion: (await detail(id)).sourceVersion,
        kind: "CONFIRM",
        method: "ASSISTED",
        confirmerRole: "STAFF",
        relation: "",
        reason: "测试凭证绑定原子性",
        occurredAt: clock.toISOString(),
        evidenceIds: [file.data.id, 999999],
      }
      expect((await request(`${base(id)}/participants/${r}/confirm`, "POST", social, b)).code).toBe(
        2003,
      )
      expect((await db.select().from(s.participationEvents)).length).toBe(eventBefore)
      expect(
        (await request(`${base(id)}/evidence`)).data.find(
          (f: { id: number }) => f.id === file.data.id,
        ).boundKind,
      ).toBeNull()
      class Failing extends ProjectRepository {
        override write<T>(
          actor: Actor,
          work: (tx: BusinessConnection, data: BusinessState, current: Actor) => Promise<T>,
        ) {
          return super.write(actor, async (tx, data, current) => {
            tx.executions.evidence.insert = async () => {
              throw new Error("file metadata rollback probe")
            }
            return work(tx, data, current)
          })
        }
      }
      const directory = "./storage/integration-execution",
        before = (await readdir(directory)).sort(),
        identity = new IdentityService(new IdentityRepository(db)),
        actor = await identity.actor(socialId)
      let failure: unknown
      try {
        await new EvidenceService(new Failing(db), directory, () => clock).upload(
          actor,
          id,
          new File(["%PDF-1.4\nprobe"], "probe.pdf"),
          key(),
        )
      } catch (error) {
        failure = error
      }
      expect(failure).toBeInstanceOf(Error)
      expect((await readdir(directory)).sort()).toEqual(before)
      const oldMax = env.executionUploadMaxBytes
      try {
        Object.assign(env, { executionUploadMaxBytes: 4 })
        expect((await upload(id)).code).toBe(1000)
      } finally {
        Object.assign(env, { executionUploadMaxBytes: oldMax })
      }
      expect(
        (await request(`/execution/evidence/${file.data.id}`, "DELETE", leader)).code,
      ).not.toBe(0)
      expect((await request(`/execution/evidence/${file.data.id}`, "DELETE", social)).code).toBe(0)
    })
    test("V06资格变化撤销未用卡，历史补录使用冻结资格并保留当前权限", async () => {
      set("10:00")
      const id = await create(),
        [r] = await roster(id),
        db = context().database
      expect((await request(`${base(id)}/start`, "POST", social, await payload(id))).code).toBe(0)
      const c = await issue(id, r),
        members = (await db.select().from(s.projectMemberships)).filter(
          (m) => m.projectId === projectId && m.userId === socialId,
        )
      for (const m of members)
        await db
          .update(s.projectMemberships)
          .set({ endDate: today })
          .where(eq(s.projectMemberships.id, m.id))
      set("10:20")
      expect(
        (await request("/execution/participation/resolve", "POST", "", { token: c.token })).status,
      ).toBe(404)
      expect(
        (
          await request(`${base(id)}/attendance`, "POST", social, {
            ...(await payload(id)),
            kind: "CHECK_OUT",
            method: "NORMAL",
          })
        ).code,
      ).toBe(2003)
      expect(
        (
          await request(`${base(id)}/attendance`, "POST", social, {
            ...(await payload(id)),
            kind: "CHECK_OUT",
            method: "SUPPLEMENT",
            declaredAt: at("10:10").toISOString(),
            reason: "发生期间有效，之后归属调整",
            geo: { status: "UNAVAILABLE" },
          })
        ).code,
      ).toBe(0)
      for (const m of members)
        await db
          .update(s.projectMemberships)
          .set({ endDate: m.endDate })
          .where(eq(s.projectMemberships.id, m.id))
      set("10:30")
      const endBody = await payload(id)
      expect((await request(`${base(id)}/end`, "POST", social, endBody)).code).toBe(0)
      expect((await request(`${base(id)}/end`, "POST", social, endBody)).code).toBe(0)
      expect(
        (await detail(id)).attendance.filter(
          (e: { userId: number; kind: string }) => e.userId === socialId && e.kind === "CHECK_OUT",
        ).length,
      ).toBe(1)
      set("10:00")
    })
    test("V06开场写入故障整体回滚，无孤立执行与原始事件", async () => {
      const id = await create(),
        db = context().database
      class Failing extends ProjectRepository {
        override write<T>(
          actor: Actor,
          work: (tx: BusinessConnection, data: BusinessState, current: Actor) => Promise<T>,
        ) {
          return super.write(actor, async (tx, data, current) => {
            tx.executions.staffEvents.insert = async () => {
              throw new Error("B3 rollback probe")
            }
            return work(tx, data, current)
          })
        }
      }
      const identity = new IdentityService(new IdentityRepository(db)),
        actor = await identity.actor(socialId)
      const before = (await db.select().from(s.auditLogs)).length
      let failure: unknown
      try {
        await new ExecutionService(new Failing(db), () => clock).start(
          actor,
          await Promise.resolve(id),
          await payload(id),
        )
      } catch (error) {
        failure = error
      }
      expect(failure).toBeInstanceOf(Error)
      expect((await detail(id)).session).toBeNull()
      expect((await db.select().from(s.auditLogs)).length).toBe(before)
      expect((await request(`${base(id)}/start`, "POST", social, await payload(id))).code).toBe(0)
    })
  })
}
