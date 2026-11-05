import { beforeAll, describe, expect, test } from "bun:test"
import { and, eq } from "drizzle-orm"
import * as s from "@/db/schema"
import {
  ProjectRepository,
  type BusinessConnection,
  type BusinessState,
} from "@/modules/project/project.repository"
import { ProjectService } from "@/modules/project/project.service"
import { IdentityService } from "@/modules/identity/identity.service"
import { IdentityRepository, type Database } from "@/modules/identity/identity.repository"
import type { Actor } from "@/utils/authorization"
import { ResourceRepository } from "./resource.repository"
import { grantResourcePermissions } from "./resource.seed"
export function registerResourceTests(
  context: () => { database: Database; handle: (r: Request) => Response | Promise<Response> },
) {
  describe("B1单位资源与合同联动", () => {
    let admin = "",
      manager = "",
      social = "",
      other = "",
      a = 0,
      b = 0,
      target = 0,
      projectId = 0
    let managerId = 0,
      managerOrg = 0,
      socialId = 0,
      socialOrg = 0,
      otherId = 0,
      otherOrg = 0,
      seniorId = 0
    const body = (name: string, userId = managerId, orgId = managerOrg) => ({
      name,
      unitType: "社区",
      region: "测试区域",
      regionCode: "440304",
      ownerOrgId: orgId,
      maintainerId: userId,
    })
    async function request(path: string, method = "GET", token = manager, input?: unknown) {
      const response = await context().handle(
        new Request(`http://localhost/api${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(input ? { "content-type": "application/json" } : {}),
          },
          ...(input ? { body: JSON.stringify(input) } : {}),
        }),
      )
      return { status: response.status, ...(await response.json()) }
    }
    async function login(username: string) {
      return (await request("/auth/login", "POST", "", { username, password: "IdentityTest_2026" }))
        .data.token as string
    }
    async function detail(id = a, token = manager) {
      return (await request(`/resources/${id}`, "GET", token)).data
    }
    beforeAll(async () => {
      await grantResourcePermissions(context().database, true)
      admin = await login("admin")
      manager = await login("project_manager")
      social = await login("social")
      other = await login("other_social")
      const users = await context().database.select().from(s.users)
      const m = users.find((u) => u.username === "project_manager")!,
        x = users.find((u) => u.username === "social")!,
        y = users.find((u) => u.username === "other_social")!
      managerId = m.id
      managerOrg = m.orgId!
      socialId = x.id
      socialOrg = x.orgId!
      otherId = y.id
      otherOrg = y.orgId!
      seniorId = users.find((u) => u.username === "supervisor")!.id
    })
    test("R01独立台账、同名不同区与请求幂等", async () => {
      const input = {
        ...body("B1社区中心"),
        creditCode: "B1TESTCODE",
        requestKey: "resource-request-a",
      }
      const r = await request("/resources", "POST", manager, input)
      expect(r.code).toBe(0)
      a = r.data.id
      expect((await request("/resources", "POST", manager, input)).data.id).toBe(a)
      expect((await detail()).relationship).toBe("POTENTIAL")
      expect(
        (
          await request("/resources", "POST", manager, {
            ...input,
            requestKey: "duplicate-code-request",
          })
        ).code,
      ).toBe(4000)
      b = (
        await request("/resources", "POST", manager, { ...body("B1社区中心"), region: "另一区域" })
      ).data.id
      expect(b).not.toBe(a)
      target = (await request("/resources", "POST", manager, body("B1合并目标"))).data.id
      expect(
        (await request("/resources?keyword=B1&pageSize=10&sortBy=name&sortOrder=asc")).data.total,
      ).toBe(3)
      expect((await request("/resources?sortBy=creditCode&sortOrder=asc")).code).toBe(1000)
    })
    test("R06跨团队、联系人权限与候选隔离", async () => {
      const ra = await request(
        "/resources",
        "POST",
        social,
        body("甲团队私有资源", socialId, socialOrg),
      )
      const rb = await request(
        "/resources",
        "POST",
        other,
        body("乙团队私有资源", otherId, otherOrg),
      )
      expect(ra.code).toBe(0)
      expect(rb.code).toBe(0)
      expect((await request(`/resources/${rb.data.id}`, "GET", social)).code).toBe(3000)
      expect(
        (await request("/resources/candidates", "GET", social)).data.resources.some(
          (r: { id: number }) => r.id === rb.data.id,
        ),
      ).toBe(false)
      expect(
        (await request("/resources", "POST", social, body("伪造归属", otherId, otherOrg))).code,
      ).toBe(2003)
      const roles = await context().database.select().from(s.roles),
        roleId = roles.find((r) => r.code === "social")!.id
      await context()
        .database.delete(s.rolePermissions)
        .where(
          and(
            eq(s.rolePermissions.roleId, roleId),
            eq(s.rolePermissions.permissionCode, "resource:contact:view"),
          ),
        )
      try {
        expect((await request(`/resources/${ra.data.id}/contacts`, "GET", social)).code).toBe(2003)
        expect((await detail(ra.data.id, social)).contacts).toEqual([])
      } finally {
        await context()
          .database.insert(s.rolePermissions)
          .values({ roleId, permissionCode: "resource:contact:view" })
      }
    })
    test("R01两位联系人并发切换、版本与日志脱敏", async () => {
      const input = { name: "联系人甲", phone: "18812345678", isPrimary: true, status: "ACTIVE" }
      const responses = await Promise.all([
        request(`/resources/${a}/contacts`, "POST", manager, input),
        request(`/resources/${a}/contacts`, "POST", manager, { ...input, name: "联系人乙" }),
      ])
      expect(responses.every((r) => r.code === 0)).toBe(true)
      const contacts = (await detail()).contacts
      expect(contacts).toHaveLength(2)
      expect(contacts.filter((c: { isPrimary: number }) => c.isPrimary)).toHaveLength(1)
      expect(
        (
          await request(`/resources/${b}/contacts/${contacts[0].id}`, "PUT", manager, {
            ...input,
            version: contacts[0].version,
          })
        ).code,
      ).toBe(3000)
      const logs = await context()
        .database.select()
        .from(s.auditLogs)
        .where(eq(s.auditLogs.entityType, "resource"))
      expect(JSON.stringify(logs)).not.toContain("18812345678")
    })
    test("R02合作进展与关系分开，R05跟进校验", async () => {
      const future = await request(`/resources/${a}/cooperations`, "POST", manager, {
        title: "未来场地合作",
        ownerId: managerId,
        status: "AGREED",
        startDate: "2099-01-01",
        endDate: "2099-12-31",
        basis: "合作确认",
      })
      expect(future.code).toBe(0)
      expect((await detail()).relationship).toBe("POTENTIAL")
      expect(
        (
          await request(`/resources/${a}/cooperations`, "POST", manager, {
            title: "历史合作",
            ownerId: managerId,
            status: "ENDED",
            startDate: "2020-01-01",
            endDate: "2020-12-31",
            basis: "历史记录",
          })
        ).code,
      ).toBe(0)
      expect((await detail()).relationship).toBe("HISTORICAL")
      const f = {
        occurredAt: new Date().toISOString(),
        method: "电话",
        content: "讨论下次服务",
        nextAction: "现场沟通",
        nextOwnerId: managerId,
        nextDueDate: "2020-01-01",
        completed: false,
      }
      expect(
        (
          await request(`/resources/${a}/followups`, "POST", manager, {
            ...f,
            cooperationId: future.data.id,
          })
        ).code,
      ).toBe(0)
      expect(
        (
          await request(`/resources/${b}/followups`, "POST", manager, {
            ...f,
            cooperationId: future.data.id,
          })
        ).code,
      ).toBe(1000)
      expect(
        (await request("/resources?overdue=1&keyword=B1")).data.list.some(
          (r: { id: number }) => r.id === a,
        ),
      ).toBe(true)
    })
    test("R03快捷建档、合同快照、两合同同资源与回滚", async () => {
      const identities = new IdentityService(new IdentityRepository(context().database)),
        actor = await identities.actor(managerId)
      const projects = new ProjectService(new ProjectRepository(context().database))
      const input = {
        code: "b1-contract-one",
        name: "资源合同测试",
        category: "CONTRACT_PACKAGE" as const,
        ownerOrgId: managerOrg,
        directorId: managerId,
        seniorDirectorId: seniorId,
        supervisorId: null,
        serviceFieldCode: "社区建设",
      }
      projectId = (await projects.create(actor, input)).id
      let p = await projects.detail(actor, projectId)
      const contactId = (await detail()).contacts[0].id
      const contract = {
        resourceId: a,
        contactId,
        partnerName: "B1社区中心",
        startDate: "2026-01-01",
        endDate: "2028-12-31",
        amount: "100.00",
        serviceArea: "测试区域",
        regionCode: "440304",
      }
      await projects.contract(actor, projectId, contract, p.version)
      const r = await detail()
      await request(`/resources/${a}`, "PUT", manager, {
        ...body("B1社区中心更名"),
        creditCode: "B1TESTCODE",
        version: r.version,
      })
      p = await projects.detail(actor, projectId)
      expect(p.contract!.partnerName).toBe("B1社区中心")
      expect(JSON.stringify(p.contract)).not.toContain("18812345678")
      const second = (await projects.create(actor, { ...input, code: "b1-contract-two" })).id
      await projects.contract(
        actor,
        second,
        { ...contract, contactId: undefined },
        (await projects.detail(actor, second)).version,
      )
      expect((await detail()).contracts).toHaveLength(2)
      expect((await detail()).contracts[0].amount).toBeUndefined()
      expect((await detail()).contracts[0].note).toBeUndefined()
      const failureId = (await projects.create(actor, { ...input, code: "b1-failure" })).id
      expect(
        (
          await request(`/projects/${failureId}/contract`, "PUT", manager, {
            ...contract,
            resourceId: undefined,
            contactId: undefined,
            version: 1,
            quickResource: { ...body("信用代码冲突"), creditCode: "B1TESTCODE" },
          })
        ).code,
      ).toBe(4000)
      class FailureRepository extends ProjectRepository {
        override write<T>(
          who: Actor,
          work: (tx: BusinessConnection, data: BusinessState, current: Actor) => Promise<T>,
        ) {
          return super.write(who, (tx, data, current) =>
            work(
              {
                ...tx,
                resources: {
                  ...tx.resources,
                  cooperations: {
                    ...tx.resources.cooperations,
                    insert: async () => {
                      throw new Error("injected resource failure")
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
      const failing = new ProjectService(new FailureRepository(context().database))
      let failure: unknown
      try {
        await failing.contract(
          actor,
          failureId,
          {
            ...contract,
            resourceId: undefined,
            contactId: undefined,
            partnerName: "失败回滚单位",
            quickResource: { ...body("失败回滚单位"), requestKey: "rollback-key" },
          },
          (await projects.detail(actor, failureId)).version,
        )
      } catch (error) {
        failure = error
      }
      expect(failure).toBeInstanceOf(Error)
      expect((failure as Error).message).toBe("injected resource failure")
      expect((await request("/resources?keyword=失败回滚单位")).data.total).toBe(0)
      expect((await projects.detail(actor, failureId)).contract).toBeNull()
      expect((await projects.detail(actor, failureId)).version).toBe(1)
    })
    test("R04旧合同显式核对保留原文，合并引用与双版本", async () => {
      const db = context().database
      const existing = (
        await db
          .select()
          .from(s.projectContracts)
          .where(eq(s.projectContracts.projectId, projectId))
      )[0]
      await db
        .update(s.projectContracts)
        .set({ resourceId: null, partnerName: "签约时旧名称" })
        .where(eq(s.projectContracts.id, existing.id))
      const legacy = (await request("/resources/legacy-contracts")).data.find(
        (c: { id: number }) => c.id === existing.id,
      )
      expect(legacy).toBeDefined()
      expect(
        (
          await request(`/resources/legacy-contracts/${existing.id}/link`, "POST", manager, {
            resourceId: a,
            version: legacy.projectVersion,
          })
        ).code,
      ).toBe(0)
      expect(
        (await detail()).contracts.find((c: { id: number }) => c.id === existing.id).partnerName,
      ).toBe("签约时旧名称")
      const src = await detail(),
        dst = await detail(target)
      const input = {
        sourceId: a,
        targetId: target,
        sourceVersion: src.version,
        targetVersion: dst.version,
        reason: "确认同一单位",
      }
      expect((await request("/resources/merge-preview", "POST", admin, input)).data.contracts).toBe(
        2,
      )
      const contact = (await detail()).contacts[0]
      await request(`/resources/${a}/contacts/${contact.id}`, "PUT", manager, {
        name: contact.name,
        position: contact.position,
        phone: contact.phone,
        email: contact.email,
        note: "预览后补充记录",
        isPrimary: !!contact.isPrimary,
        status: contact.status,
        version: contact.version,
      })
      expect((await request("/resources/merge", "POST", admin, input)).code).toBe(4000)
      input.sourceVersion = (await detail()).version
      expect((await request("/resources/merge", "POST", admin, input)).code).toBe(0)
      expect((await detail()).status).toBe("MERGED")
      expect((await detail(target)).contracts).toHaveLength(2)
      expect(
        (await detail(target)).contacts.filter((c: { isPrimary: number }) => c.isPrimary),
      ).toHaveLength(1)
      expect((await request("/resources/merge", "POST", admin, input)).code).toBe(4000)
      const t = await detail(target)
      expect(
        (
          await request(`/resources/${target}/archive`, "POST", admin, {
            version: t.version,
            reason: "停止维护",
          })
        ).code,
      ).toBe(0)
      expect(
        (await request("/resources/candidates")).data.resources.some(
          (r: { id: number }) => r.id === target,
        ),
      ).toBe(false)
      expect((await detail(target)).contracts[0].partnerName).toBeTruthy()
    })
    test("R06权限撤销立即生效，显式补充默认只预览", async () => {
      const preview = await grantResourcePermissions(context().database)
      expect(preview.apply).toBe(false)
      const repository = new ResourceRepository(context().database),
        identities = new IdentityService(new IdentityRepository(context().database))
      const actor = await identities.actor(managerId)
      await context()
        .database.update(s.users)
        .set({ status: "DISABLED" })
        .where(eq(s.users.id, managerId))
      try {
        let denied = false
        try {
          await repository.run(actor, false, async () => true)
        } catch {
          denied = true
        }
        expect(denied).toBe(true)
      } finally {
        await context()
          .database.update(s.users)
          .set({ status: "ACTIVE" })
          .where(eq(s.users.id, managerId))
      }
    })
  })
}
