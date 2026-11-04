import { beforeAll, describe, test, expect } from "bun:test"
import { eq } from "drizzle-orm"
import * as s from "@/db/schema"
import type { Database } from "@/modules/identity/identity.repository"
import { businessDate, nextDay } from "@/modules/task/task-calendar"
import { env } from "@/utils/env"
import {
  ProjectRepository,
  type BusinessConnection,
  type BusinessState,
} from "@/modules/project/project.repository"
import { IdentityRepository } from "@/modules/identity/identity.repository"
import { IdentityService } from "@/modules/identity/identity.service"
import { OutcomeService } from "./outcome.service"
import type { Actor } from "@/utils/authorization"
export function registerOutcomeTests(
  context: () => {
    database: Database
    handle: (r: Request) => Response | Promise<Response>
    setClock: (at: Date) => void
  },
) {
  describe("B4来源档案与核验统计", () => {
    let manager = "",
      social = "",
      leader = "",
      other = "",
      admin = "",
      projectId = 0,
      teamId = 0,
      socialId = 0,
      pointId = 0,
      first = 0,
      second = 0,
      serial = 0
    const today = businessDate(),
      end = nextDay(today, 60),
      ids: number[] = [],
      people: number[] = [],
      key = () => `b4-${++serial}`
    let clock = new Date(`${today}T10:00:00+08:00`)
    const set = (time: string) => {
      clock = new Date(`${today}T${time}:00+08:00`)
      context().setClock(clock)
    }
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
      return { status: response.status, ...(await response.json()) }
    }
    async function good(path: string, method = "GET", token = social, body?: unknown) {
      const r = await request(path, method, token, body)
      expect(r.code).toBe(0)
      return r.data
    }
    const base = (id: number) => `/service/tasks/${id}/execution`,
      outcome = (id: number) => `/service/tasks/${id}/outcome`
    async function executionInput(id: number) {
      const d = await good(base(id))
      return {
        requestKey: key(),
        sourceVersion: d.sourceVersion,
        declaredAt: clock.toISOString(),
        geo: {
          status: "OK",
          latitude: 23,
          longitude: 113,
          accuracy: 12,
          sampledAt: clock.toISOString(),
        },
        reason: "",
        evidenceIds: [],
      }
    }
    async function create(start = "10:00", finish = "11:00", indicators = ids) {
      const body = {
        projectId,
        teamId,
        title: `B4服务${key()}`,
        form: "COLLECTIVE",
        kind: indicators.length ? "INDICATOR" : "OTHER",
        pointId,
        location: "虚构服务室",
        address: "隔离验收",
        startAt: new Date(`${today}T${start}:00+08:00`).toISOString(),
        endAt: new Date(`${today}T${finish}:00+08:00`).toISOString(),
        leaderId: socialId,
        staffIds: [socialId],
        expectedPeople: 8,
        description: "来源核验",
        evidence: "参与明细",
        indicators: indicators.map((indicatorId) => ({ indicatorId, plannedValue: "1" })),
        resources: [],
      }
      const preview = await good("/service/tasks/preview", "POST", manager, body)
      return (
        await good("/service/tasks", "POST", manager, {
          ...body,
          previewToken: preview.previewToken,
          requestKey: key(),
          conflictReason: "隔离来源计算样例",
        })
      ).id as number
    }
    async function runTask(
      id: number,
      start = "10:00",
      finish = "11:00",
      count = 8,
      reuse = false,
    ) {
      set(start)
      await good(`${base(id)}/start`, "POST", social, await executionInput(id))
      for (let i = 0; i < count; i++) {
        const participantId = reuse
          ? people[i]!
          : (
              await good("/service/participants", "POST", social, {
                projectId,
                taskId: id,
                name: `虚构参与者${key()}`,
                requestKey: key(),
              })
            ).id
        if (!reuse) people.push(participantId)
        const roster = (await good(`${base(id)}/participants`, "POST", social, { participantId }))
          .id
        const d = await good(base(id))
        await good(`${base(id)}/participants/${roster}/confirm`, "POST", social, {
          sourceVersion: d.sourceVersion,
          requestKey: key(),
          kind: "CONFIRM",
          method: "ASSISTED",
          confirmerRole: "STAFF",
          relation: "",
          reason: "虚构对象操作不便，辅助登记",
          occurredAt: clock.toISOString(),
          evidenceIds: [],
        })
      }
      set(finish)
      await good(`${base(id)}/end`, "POST", social, await executionInput(id))
    }
    async function generate(id: number) {
      return good(outcome(id), "POST")
    }
    async function save(id: number, evidenceIds: number[] = []) {
      const d = await good(outcome(id))
      await good(outcome(id), "PUT", social, {
        version: d.outcome.version,
        sourceVersion: d.sourceVersion,
        summary: "B4隔离服务总结",
        manualValues: {},
        evidenceIds,
      })
      return good(outcome(id))
    }
    async function submit(id: number) {
      const d = await good(outcome(id))
      const body = {
        version: d.outcome.version,
        sourceVersion: d.sourceVersion,
        recordIds: d.records
          .filter(
            (r: { record: { status: string } }) =>
              r.record.status === "DRAFT" || r.record.status === "REJECTED",
          )
          .map((r: { recordId: number }) => r.recordId),
        requestKey: key(),
      }
      const result = await good(`${outcome(id)}/submit`, "POST", social, body)
      return { body, result }
    }
    async function taskFor(instanceId: number) {
      return (await good("/approvals/tasks?pageSize=100", "GET", leader)).list.find(
        (t: { instanceId: number }) => t.instanceId === instanceId,
      )
    }
    async function approve(instanceId: number, excludeFirst = false) {
      const task = await taskFor(instanceId),
        detail = await good(`/approvals/instances/${instanceId}`, "GET", leader)
      const body = {
        version: task.version,
        decisions: detail.outcome.source.issues.map((i: { key: string }, n: number) => ({
          key: i.key,
          decision: excludeFirst && n === 0 ? "EXCLUDE" : "ACCEPT",
          reason: "已核对原始来源及说明",
        })),
        comment: excludeFirst ? "排除一条无效参与来源" : "核对通过",
      }
      const preview = await good(
        `/approvals/tasks/${task.id}/outcome-preview`,
        "POST",
        leader,
        body,
      )
      await good(`/approvals/tasks/${task.id}/approve`, "POST", leader, {
        ...body,
        previewToken: preview.previewToken,
      })
      return { task, preview, body: { ...body, previewToken: preview.previewToken } }
    }
    async function values() {
      return (
        await good(
          `/service/indicator-progress?projectId=${projectId}&pageSize=100`,
          "GET",
          manager,
        )
      ).list
        .filter((r: { teamId: number | null }) => r.teamId === null)
        .map((r: { indicatorId: number; cumulative: string }) => [r.indicatorId, r.cumulative])
    }
    beforeAll(async () => {
      Object.assign(env, { devSuperadminUsername: "" })
      const db = context().database
      async function login(name: string) {
        return (
          await good("/auth/login", "POST", "", { username: name, password: "IdentityTest_2026" })
        ).token as string
      }
      manager = await login("project_manager")
      social = await login("social")
      leader = await login("leader")
      other = await login("other_social")
      admin = await login("admin")
      const users = await db.select().from(s.users),
        orgs = await db.select().from(s.organizations),
        m = users.find((u) => u.username === "project_manager")!,
        senior = users.find((u) => u.username === "supervisor")!,
        l = users.find((u) => u.username === "leader")!
      socialId = users.find((u) => u.username === "social")!.id
      teamId = orgs.find((o) => o.code === "demo-team-a")!.id
      const [p] = await db.insert(s.projects).values({
        code: "b4-integration",
        name: "B4来源项目",
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
        startDate: today,
        endDate: end,
        amount: "100",
        serviceArea: "测试",
      })
      await db.insert(s.projectTeams).values({ projectId, teamId, reporterId: l.id })
      await db.insert(s.projectMemberships).values(
        [socialId, l.id].map((userId) => ({
          projectId,
          teamId,
          userId,
          startDate: today,
          endDate: end,
        })),
      )
      const [point] = await db.insert(s.projectServicePoints).values({
        projectId,
        name: "参考点",
        address: "虚构",
        latitude: 23,
        longitude: 113,
        radius: 200,
      })
      pointId = point.insertId
      for (const [mode, unit] of [
        ["SCENES", "场"],
        ["VISITS", "人次"],
        ["PEOPLE", "人"],
        ["STAFF_HOURS", "小时"],
      ]) {
        const [i] = await db.insert(s.projectIndicators).values({
          projectId,
          name: `B4${mode}`,
          unit,
          definition: "来源计算",
          targetValue: "100",
          status: "ACTIVE",
        })
        ids.push(i.insertId)
        const [target] = await db
          .insert(s.teamIndicatorTargets)
          .values({ indicatorId: i.insertId, teamId, targetValue: "100" })
        await good(`/service/indicators/${i.insertId}/calculation-rule`, "PUT", manager, {
          mode,
          effectiveDate: today,
          revision: 0,
          reason: "B4固定样例",
        })
        const plan = await good("/service/plans", "POST", manager, {
          targetId: target.insertId,
          mode: "MILESTONE",
          effectiveDate: today,
          reason: "B4阶段计划",
          periods: [{ startDate: today, endDate: end, targetValue: "100" }],
        })
        await good(`/service/plans/${plan.id}/publish`, "POST", manager, {
          version: (await good(`/service/plans/${plan.id}`, "GET", manager)).version,
        })
      }
      first = await create()
    })
    test("未结束不能生成，真实分派和自动口径保护，重复生成来源唯一", async () => {
      expect((await request(outcome(first), "POST")).code).toBe(4000)
      expect((await request(outcome(first), "POST", other)).code).not.toBe(0)
      await runTask(first)
      const a = await generate(first),
        b = await generate(first)
      expect(a.id).toBe(b.id)
      expect((await good(outcome(first))).records.length).toBe(4)
      expect(
        (await good(outcome(first))).source.issues.every(
          (i: { reason: string }) => i.reason === "虚构对象操作不便，辅助登记",
        ),
      ).toBe(true)
      expect(
        (
          await request("/service/records", "POST", social, {
            indicatorId: ids[1],
            teamId,
            serviceDate: today,
            actualValue: "8",
            note: "绕过任务",
          })
        ).code,
      ).not.toBe(0)
      const d = await save(first)
      expect(
        (
          await request(`/service/records/${d.records[0].recordId}`, "PUT", social, {
            indicatorId: ids[0],
            teamId,
            serviceDate: today,
            actualValue: "99",
            version: d.records[0].record.version,
          })
        ).code,
      ).not.toBe(0)
    })
    test("一任务四项成果、逐项核验、批准一次生效，版本化提交和审批重试", async () => {
      const { body, result } = await submit(first)
      expect(result.instanceIds.length).toBe(4)
      expect((await good(`${outcome(first)}/submit`, "POST", social, body)).instanceIds).toEqual(
        result.instanceIds,
      )
      expect(
        (await request(`${outcome(first)}/submit`, "POST", social, { ...body, recordIds: [] }))
          .code,
      ).toBe(4000)
      expect(new Map(await values()).get(ids[1])).toBe("0.00")
      const task = await taskFor(result.instanceIds[0])
      expect(
        (
          await request(`/approvals/tasks/${task.id}/outcome-preview`, "POST", leader, {
            version: task.version,
            decisions: [],
          })
        ).code,
      ).toBe(4000)
      expect(
        (
          await request(`/approvals/tasks/${task.id}/approve`, "POST", social, {
            version: task.version,
            decisions: [],
          })
        ).code,
      ).not.toBe(0)
      for (const id of result.instanceIds) {
        const approved = await approve(id)
        await good(`/approvals/tasks/${approved.task.id}/approve`, "POST", leader, approved.body)
      }
      const v = new Map(await values())
      expect([v.get(ids[0]), v.get(ids[1]), v.get(ids[2]), v.get(ids[3])]).toEqual([
        "1.00",
        "8.00",
        "8.00",
        "1.00",
      ])
      expect((await good(`/service/tasks/${first}`)).state).toBe("COMPLETED")
      expect(
        (
          await request(`/service/indicators/${ids[2]}/calculation-rule`, "PUT", manager, {
            mode: "MANUAL",
            effectiveDate: today,
            revision: 1,
            reason: "不能抹去去重语义",
          })
        ).code,
      ).toBe(4000)
    })
    test("跨任务对象去重、人员重叠时段并集，Excel与监测共用正式来源", async () => {
      second = await create("10:30", "11:30")
      await runTask(second, "10:30", "11:30", 3, true)
      await generate(second)
      await save(second)
      const { result } = await submit(second)
      for (const id of result.instanceIds) await approve(id)
      const v = new Map(await values())
      expect([v.get(ids[0]), v.get(ids[1]), v.get(ids[2]), v.get(ids[3])]).toEqual([
        "2.00",
        "11.00",
        "8.00",
        "1.50",
      ])
    })
    test("批准后来源变更保持原值，来源更正批准后替换并保留核定差异", async () => {
      const e = (await good(base(first))).exceptions[0]
      await good(`/execution/exceptions/${e.id}/notes`, "POST", social, {
        version: e.version,
        reason: "补充核验依据",
        evidenceIds: [],
        requestKey: key(),
      })
      expect(new Map(await values()).get(ids[1])).toBe("11.00")
      expect((await good(`/service/tasks/${first}`)).sourceChanged).toBe(true)
      const d = await save(first),
        link = d.records.find((r: { indicatorId: number }) => r.indicatorId === ids[1])
      const change = await good(
        `/service/records/${link.recordId}/change-requests`,
        "POST",
        social,
        { version: link.record.version, operation: "CORRECT", reason: "按新来源更正" },
      )
      expect(new Map(await values()).get(ids[1])).toBe("11.00")
      const result = await approve(change.instanceId, true)
      expect(result.preview.value).toBe("7.00")
      expect(new Map(await values()).get(ids[1])).toBe("10.00")
    })
    test("在途来源变化阻止批准，驳回与撤回保留原正式统计", async () => {
      const id = await create("12:00", "13:00", [ids[0]!])
      await runTask(id, "12:00", "13:00", 1, true)
      await generate(id)
      await save(id)
      const { result } = await submit(id)
      const t = await taskFor(result.instanceIds[0])
      const e = (await good(base(id))).exceptions[0]
      await good(`/execution/exceptions/${e.id}/notes`, "POST", social, {
        version: e.version,
        reason: "在途来源变化",
        evidenceIds: [],
        requestKey: key(),
      })
      expect(
        (
          await request(`/approvals/tasks/${t.id}/outcome-preview`, "POST", leader, {
            version: t.version,
            decisions: [],
          })
        ).code,
      ).toBe(4000)
      await good(`/approvals/tasks/${t.id}/reject`, "POST", leader, {
        version: t.version,
        comment: "来源更新后重提",
      })
      await save(id)
      const retry = await submit(id)
      const record = (await good(outcome(id))).records[0]
      await good(`/service/records/${record.recordId}/withdraw`, "POST")
      expect(
        (await good(`/approvals/instances/${retry.result.instanceIds[0]}`, "GET", leader)).status,
      ).toBe("CANCELLED")
    })
    test("指标外总结实际主管确认，业务编号与普通档案隔离", async () => {
      const id = await create("14:00", "15:00", [])
      await runTask(id, "14:00", "15:00", 0)
      await generate(id)
      await save(id)
      const { result } = await submit(id)
      const instance = await good(`/approvals/instances/${result.instanceIds[0]}`, "GET", leader)
      expect(instance.businessType).toBe("TASK_SUMMARY")
      expect(instance.outcome.source.rules.length).toBe(0)
      await approve(result.instanceIds[0])
      expect((await good(`/service/tasks/${id}`)).state).toBe("COMPLETED")
      expect(
        (await request(`/approvals/instances/${result.instanceIds[0]}`, "GET", other)).code,
      ).not.toBe(0)
    })
    test("来源快照写入失败全部回滚，并发生成和批次提交不重复", async () => {
      const id = await create("16:00", "17:00", [ids[0]!])
      await runTask(id, "16:00", "17:00", 1, true)
      const db = context().database,
        identity = new IdentityService(new IdentityRepository(db)),
        actor = await identity.actor(socialId)
      class Failing extends ProjectRepository {
        override write<T>(
          actor: Actor,
          work: (tx: BusinessConnection, data: BusinessState, current: Actor) => Promise<T>,
        ) {
          return super.write(actor, async (tx, data, current) => {
            tx.outcomes.snapshots.insert = async () => {
              throw new Error("B4 rollback probe")
            }
            return work(tx, data, current)
          })
        }
      }
      const before = await db.select().from(s.taskOutcomes),
        records = await db.select().from(s.monthlyReports)
      let failure: unknown
      try {
        await new OutcomeService(new Failing(db)).generate(actor, id)
      } catch (error) {
        failure = error
      }
      expect(failure).toBeInstanceOf(Error)
      expect((failure as Error).message).toContain("B4 rollback probe")
      expect((await db.select().from(s.taskOutcomes)).length).toBe(before.length)
      expect((await db.select().from(s.monthlyReports)).length).toBe(records.length)
      const generated = await Promise.all([generate(id), generate(id)])
      expect(generated[0].id).toBe(generated[1].id)
      const d = await save(id),
        body = {
          version: d.outcome.version,
          sourceVersion: d.sourceVersion,
          recordIds: d.records.map((r: { recordId: number }) => r.recordId),
          requestKey: key(),
        }
      const submitted = await Promise.all([
        good(`${outcome(id)}/submit`, "POST", social, body),
        good(`${outcome(id)}/submit`, "POST", social, body),
      ])
      expect(submitted[0].instanceIds).toEqual(submitted[1].instanceIds)
    })
    test("整理凭证可重复上传、绑定后保留，实际审批人可下载", async () => {
      const id = first,
        requestKey = key()
      async function upload() {
        const form = new FormData()
        form.append("file", new File(["%PDF-1.4\nB4 evidence\n%%EOF"], "B4核验.pdf"))
        form.append("requestKey", requestKey)
        return (
          await context().handle(
            new Request(`http://localhost/api${outcome(id)}/evidence`, {
              method: "POST",
              headers: { Authorization: `Bearer ${social}` },
              body: form,
            }),
          )
        ).json()
      }
      const file = await upload()
      expect(file.code).toBe(0)
      expect((await upload()).data.id).toBe(file.data.id)
      await save(id, [file.data.id])
      const d = await good(outcome(id))
      expect(d.source.evidence.some((f: { id: number }) => f.id === file.data.id)).toBe(true)
      const protectedFile = await request(`/execution/evidence/${file.data.id}`, "DELETE", social, {
        version: file.data.version,
      })
      expect(protectedFile.code).not.toBe(0)
      const response = await context().handle(
        new Request(`http://localhost/api/execution/evidence/${file.data.id}/download`, {
          headers: { Authorization: `Bearer ${leader}` },
        }),
      )
      expect(response.status).toBe(200)
      expect(
        (await request(`/execution/evidence/${file.data.id}/download`, "GET", other)).code,
      ).not.toBe(0)
    })
    test("多指标提交中途失败全部回滚，并发批准仅生效一次", async () => {
      const id = await create("18:00", "19:00")
      await runTask(id, "18:00", "19:00", 1, true)
      await generate(id)
      const d = await save(id)
      const db = context().database,
        identity = new IdentityService(new IdentityRepository(db)),
        actor = await identity.actor(socialId),
        before = await db.select().from(s.approvalInstances),
        pending = await db.select().from(s.approvalTasks)
      class Failing extends ProjectRepository {
        override write<T>(
          actor: Actor,
          work: (tx: BusinessConnection, data: BusinessState, current: Actor) => Promise<T>,
        ) {
          return super.write(actor, async (tx, data, current) => {
            const original = tx.approvalTasks.insert
            let n = 0
            tx.approvalTasks.insert = (value) => {
              if (++n === 2) throw new Error("B4 submit rollback")
              return original(value)
            }
            return work(tx, data, current)
          })
        }
      }
      const input = {
        version: d.outcome.version,
        sourceVersion: d.sourceVersion,
        recordIds: d.records.map((r: { recordId: number }) => r.recordId),
        requestKey: key(),
      }
      let failure: unknown
      try {
        await new OutcomeService(new Failing(db)).submit(actor, id, input)
      } catch (error) {
        failure = error
      }
      expect((failure as Error).message).toContain("B4 submit rollback")
      expect((await db.select().from(s.approvalInstances)).length).toBe(before.length)
      expect((await db.select().from(s.approvalTasks)).length).toBe(pending.length)
      expect(
        (await good(outcome(id))).records.every(
          (r: { record: { status: string } }) => r.record.status === "DRAFT",
        ),
      ).toBe(true)
      const result = await good(`${outcome(id)}/submit`, "POST", social, input),
        task = await taskFor(result.instanceIds[0]),
        detail = await good(`/approvals/instances/${result.instanceIds[0]}`, "GET", leader),
        body = {
          version: task.version,
          decisions: detail.outcome.source.issues.map((i: { key: string }) => ({
            key: i.key,
            decision: "ACCEPT",
            reason: "来源已核对",
          })),
          comment: "核验通过",
        },
        preview = await good(`/approvals/tasks/${task.id}/outcome-preview`, "POST", leader, body)
      await Promise.all([
        good(`/approvals/tasks/${task.id}/approve`, "POST", leader, {
          ...body,
          previewToken: preview.previewToken,
        }),
        good(`/approvals/tasks/${task.id}/approve`, "POST", leader, {
          ...body,
          previewToken: preview.previewToken,
        }),
      ])
      expect(
        (await db.select().from(s.outcomeReviews)).filter((r) => r.approvalTaskId === task.id)
          .length,
      ).toBe(1)
    })
    test("专业成果保留人工小数，缺少凭证不能提交，绑定后正常核验", async () => {
      const db = context().database,
        [metric] = await db.insert(s.projectIndicators).values({
          projectId,
          name: "B4专业成果",
          unit: "份",
          definition: "专业判断",
          targetValue: "10",
          status: "ACTIVE",
        }),
        [target] = await db
          .insert(s.teamIndicatorTargets)
          .values({ indicatorId: metric.insertId, teamId, targetValue: "10" })
      const plan = await good("/service/plans", "POST", manager, {
        targetId: target.insertId,
        mode: "MILESTONE",
        effectiveDate: today,
        reason: "专业成果计划",
        periods: [{ startDate: today, endDate: end, targetValue: "10" }],
      })
      await good(`/service/plans/${plan.id}/publish`, "POST", manager, {
        version: (await good(`/service/plans/${plan.id}`, "GET", manager)).version,
      })
      const id = await create("20:00", "21:00", [metric.insertId])
      await runTask(id, "20:00", "21:00", 1, true)
      await generate(id)
      async function saveManual(evidenceIds: number[] = []) {
        const d = await good(outcome(id))
        await good(outcome(id), "PUT", social, {
          version: d.outcome.version,
          sourceVersion: d.sourceVersion,
          summary: "专业成果说明",
          manualValues: { [metric.insertId]: "2.50" },
          evidenceIds,
        })
        return good(outcome(id))
      }
      const d = await saveManual()
      expect(
        (
          await request(`${outcome(id)}/submit`, "POST", social, {
            version: d.outcome.version,
            sourceVersion: d.sourceVersion,
            recordIds: d.records.map((r: { recordId: number }) => r.recordId),
            requestKey: key(),
          })
        ).code,
      ).toBe(1000)
      const form = new FormData()
      form.append("file", new File(["%PDF-1.4\nprofessional evidence"], "专业成果.pdf"))
      form.append("requestKey", key())
      const file = await (
        await context().handle(
          new Request(`http://localhost/api${outcome(id)}/evidence`, {
            method: "POST",
            headers: { Authorization: `Bearer ${social}` },
            body: form,
          }),
        )
      ).json()
      expect(file.code).toBe(0)
      await saveManual([file.data.id])
      const { result } = await submit(id)
      await approve(result.instanceIds[0])
      expect((await good(outcome(id))).records[0].record.actualValue).toBe("2.50")
    })
    test("计算规则新版本不改写已生成任务的冻结口径", async () => {
      const old = (await good(outcome(first))).source.rules.find(
        (r: { indicatorId: number }) => r.indicatorId === ids[0],
      )
      await good(`/service/indicators/${ids[0]}/calculation-rule`, "PUT", manager, {
        mode: "SCENES",
        effectiveDate: today,
        revision: 1,
        reason: "同口径新版本说明",
      })
      const current = await save(first)
      expect(
        current.source.rules.find((r: { indicatorId: number }) => r.indicatorId === ids[0])
          .ruleVersion,
      ).toBe(old.ruleVersion)
      expect(
        (
          await request(`/service/indicators/${ids[0]}/calculation-rule`, "PUT", manager, {
            mode: "MANUAL",
            effectiveDate: today,
            revision: 2,
            reason: "改写原场次语义",
          })
        ).code,
      ).toBe(4000)
    })
    test("来源撤销和恢复均核验并保留原有效版本到批准", async () => {
      const d = await good(outcome(first)),
        link = d.records.find((r: { indicatorId: number }) => r.indicatorId === ids[1]),
        old = new Map(await values()).get(ids[1])
      const deletion = await good(
        `/service/records/${link.recordId}/change-requests`,
        "POST",
        social,
        { version: link.record.version, operation: "DELETE", reason: "核对后撤销" },
      )
      expect(new Map(await values()).get(ids[1])).toBe(old)
      const task = await taskFor(deletion.instanceId)
      expect(
        (
          await request(`/approvals/tasks/${task.id}/outcome-preview`, "POST", leader, {
            version: task.version,
            decisions: [],
          })
        ).code,
      ).toBe(4000)
      await approve(deletion.instanceId)
      expect(
        (await good(outcome(first))).records.find(
          (r: { indicatorId: number }) => r.indicatorId === ids[1],
        ).record.status,
      ).toBe("VOID")
      expect(new Map(await values()).get(ids[1])).toBe("3.00")
      const current = (await good(outcome(first))).records.find(
          (r: { indicatorId: number }) => r.indicatorId === ids[1],
        ),
        restoration = await good(
          `/service/records/${current.recordId}/change-requests`,
          "POST",
          social,
          { version: current.record.version, operation: "RESTORE", reason: "按当前来源恢复" },
        )
      expect(new Map(await values()).get(ids[1])).toBe("3.00")
      await approve(restoration.instanceId)
      expect(new Map(await values()).get(ids[1])).toBe("11.00")
    })
    test("快照最小数据与跨团队访问保护", async () => {
      const d = await good(outcome(first))
      const frame = await good(`/service/outcome-snapshots/${d.snapshots[0].id}`)
      expect(JSON.stringify(frame)).not.toContain('"phone"')
      expect(JSON.stringify(frame)).not.toContain('"latitude"')
      expect(
        (await request(`/service/outcome-snapshots/${d.snapshots[0].id}`, "GET", other)).code,
      ).not.toBe(0)
      expect((await request(outcome(first), "GET", admin)).code).not.toBe(0)
      const records = await context()
        .database.select()
        .from(s.monthlyReports)
        .where(eq(s.monthlyReports.indicatorId, ids[1]!))
      expect(records.filter((r) => r.status === "SUBMITTED").length).toBe(2)
    })
  })
}
