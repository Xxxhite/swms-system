import { beforeAll, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import * as s from "@/db/schema"
import type { Database } from "@/modules/identity/identity.repository"
import { seedRegions } from "./region.seed"
import { RegionNormalizationRepository } from "./region.normalize.repository"
export function registerRegionTests(
  context: () => { database: Database; handle: (r: Request) => Response | Promise<Response> },
) {
  describe("ADR地区与地址接入", () => {
    let token = "",
      other = "",
      userId = 0,
      orgId = 0,
      id = 0,
      legacyId = 0
    async function request(path: string, method = "GET", body?: unknown, auth = token) {
      const response = await context().handle(
        new Request(`http://localhost/api${path}`, {
          method,
          headers: {
            ...(auth ? { authorization: `Bearer ${auth}` } : {}),
            ...(body ? { "content-type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      )
      return { status: response.status, ...(await response.json()) }
    }
    beforeAll(async () => {
      token = (
        await request(
          "/auth/login",
          "POST",
          { username: "project_manager", password: "IdentityTest_2026" },
          "",
        )
      ).data.token
      other = (
        await request(
          "/auth/login",
          "POST",
          { username: "other_social", password: "IdentityTest_2026" },
          "",
        )
      ).data.token
      const user = (
        await context()
          .database.select()
          .from(s.users)
          .where(eq(s.users.username, "project_manager"))
      )[0]!
      userId = user.id
      orgId = user.orgId!
    })
    const input = () => ({
      name: "ADR深圳资源",
      unitType: "社区",
      region: "伪造地区名称",
      regionCode: "440305",
      ownerOrgId: orgId,
      maintainerId: userId,
      address: "虚构测试路1号",
    })
    test("ADR01登录字典、层级及导入幂等", async () => {
      expect((await request("/regions/tree", "GET", undefined, "")).status).toBe(401)
      const tree = await request("/regions/tree")
      expect(tree.code).toBe(0)
      expect(tree.data.dataVersion).toHaveLength(64)
      const sz = tree.data.tree
        .find((r: { code: string }) => r.code === "440000")
        .children.find((r: { code: string }) => r.code === "440300")
      expect(sz.children.filter((r: { kind: string }) => r.kind === "ADMIN")).toHaveLength(9)
      expect((await request("/regions/330100")).data.map((r: { name: string }) => r.name)).toEqual([
        "浙江省",
        "杭州市",
      ])
      expect((await request("/regions/unknown")).status).toBe(400)
      expect((await seedRegions(context().database, false)).changes).toBe(0)
    })
    test("ADR02服务器生成路径，非法节点／上级地区拒绝新地点", async () => {
      for (const code of ["unknown", "440300"])
        expect((await request("/resources", "POST", { ...input(), regionCode: code })).status).toBe(
          400,
        )
      const result = await request("/resources", "POST", input())
      expect(result.code).toBe(0)
      id = result.data.id
      const detail = (await request(`/resources/${id}`)).data
      expect(detail.region).toBe("南山区")
      expect(detail.regionPathSnapshot.map((r: { name: string }) => r.name)).toEqual([
        "广东省",
        "深圳市",
        "南山区",
      ])
      expect((await request(`/resources/${id}`, "GET", undefined, other)).status).toBe(404)
    })
    test("ADR03所在地后代、待核对与旧资料非地址修改", async () => {
      const [r] = await context().database.insert(s.resources).values({
        name: "ADR历史资源",
        normalizedName: "adr历史资源",
        unitType: "社区",
        region: "历史外地",
        ownerOrgId: orgId,
        maintainerId: userId,
        createdBy: userId,
      })
      legacyId = r.insertId
      expect(
        (await request("/resources?regionCode=440300&pageSize=100")).data.list.some(
          (x: { id: number }) => x.id === id,
        ),
      ).toBe(true)
      expect(
        (await request("/resources?regionCode=440304&pageSize=100")).data.list.some(
          (x: { id: number }) => x.id === id,
        ),
      ).toBe(false)
      expect(
        (await request("/resources?regionUnmapped=1&pageSize=100")).data.list.some(
          (x: { id: number }) => x.id === legacyId,
        ),
      ).toBe(true)
      expect((await request("/resources?regionCode=440300&region=南山区")).status).toBe(400)
      const old = (await request(`/resources/${legacyId}`)).data
      const body = {
        ...input(),
        name: "ADR历史资源改名",
        region: "历史外地",
        regionCode: undefined,
        address: old.address,
        version: old.version,
      }
      expect((await request(`/resources/${legacyId}`, "PUT", body)).code).toBe(0)
      const saved = (await request(`/resources/${legacyId}`)).data
      expect(saved.regionCode).toBeNull()
      expect(saved.region).toBe("历史外地")
    })
    test("ADR04已停用节点保留回显但拒绝新写入", async () => {
      await context()
        .database.update(s.administrativeRegions)
        .set({ enabled: false })
        .where(eq(s.administrativeRegions.code, "440305"))
      try {
        expect((await request(`/resources/${id}`)).data.regionCode).toBe("440305")
        expect((await request("/resources", "POST", input())).status).toBe(400)
        expect((await request("/regions/440305")).code).toBe(0)
      } finally {
        await context()
          .database.update(s.administrativeRegions)
          .set({ enabled: true })
          .where(eq(s.administrativeRegions.code, "440305"))
      }
    })
    test("ADR05历史规范化预览无写入、应用留痕且重复执行无变动", async () => {
      const database = context().database
      const [created] = await database.insert(s.resources).values({
        name: "ADR可映射历史资源",
        normalizedName: "adr可映射历史资源",
        unitType: "社区",
        region: "福田区",
        address: "保留原详细地址",
        ownerOrgId: orgId,
        maintainerId: userId,
        createdBy: userId,
      })
      const read = async () =>
        (await database.select().from(s.resources).where(eq(s.resources.id, created.insertId)))[0]!
      const before = await read(),
        normalizer = new RegionNormalizationRepository(database)
      const denied = await normalizer.run(true, "project_manager").then(
        () => null,
        (error: Error) => error,
      )
      expect(denied?.message).toContain("管理员")
      const preview = await normalizer.run()
      expect(preview.changes.find((r) => r.kind === "resource" && r.id === before.id)?.code).toBe(
        "440304",
      )
      expect(await read()).toEqual(before)
      const applied = await normalizer.run(true)
      expect(applied.applied).toBe(true)
      const after = await read()
      expect(after.regionCode).toBe("440304")
      expect(after.regionPathSnapshot?.map((r) => r.name)).toEqual(["广东省", "深圳市", "福田区"])
      expect(after.region).toBe(before.region)
      expect(after.address).toBe(before.address)
      expect(after.version).toBe(before.version + 1)
      const logs = await database
        .select()
        .from(s.auditLogs)
        .where(eq(s.auditLogs.action, "normalize-region-address"))
      expect(logs.some((r) => r.entityType === "resource" && r.entityId === before.id)).toBe(true)
      expect((await normalizer.run(true)).changes).toHaveLength(0)
      expect(await read()).toEqual(after)
    })
  })
}
