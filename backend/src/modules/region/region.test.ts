import { suggestRegion } from "./region.normalize.repository"
import { describe, expect, test } from "bun:test"
import { regionDataset } from "./region.seed"
import { regionAddress, regionMatches, regionPath, regionTree } from "./region.shared"
import { defaultPolicy, geoChecks } from "@/modules/execution/execution-geo"

describe("地区主数据与地址语义", () => {
  test("旧地址映射只接受唯一候选，简称及含糊文字分别处理", () => {
    expect(suggestRegion(regionDataset, "福田区")).toBe("440304")
    expect(suggestRegion(regionDataset, "南山区虚构路1号")).toBe("440305")
    expect(suggestRegion(regionDataset, "杭州")).toBe("330100")
    expect(suggestRegion(regionDataset, "福田区、南山区")).toBeNull()
    expect(suggestRegion(regionDataset, "")).toBeNull()
  })
  test("广东县区完整、深圳行政与功能节点分开、东莞不伪造县区", () => {
    expect(regionDataset.filter((r) => r.code.startsWith("44") && r.level === 3)).toHaveLength(122)
    const sz = regionDataset.filter((r) => r.parentCode === "440300")
    expect(sz.filter((r) => r.kind === "ADMIN")).toHaveLength(9)
    expect(sz.filter((r) => r.kind === "SERVICE").map((r) => r.code)).toEqual([
      "BIZ_SZ_DAPENG",
      "BIZ_SZ_SHENSHAN",
    ])
    expect(regionDataset.some((r) => r.parentCode === "441900")).toBe(false)
    expect(regionTree(regionDataset)[0]?.code).toBe("440000")
    for (const row of regionDataset)
      expect(regionPath(regionDataset, row.code).length).toBe(row.level)
  })
  test("位置输入由字典生成、上级节点与历史编辑分别校验", () => {
    expect(
      regionAddress(
        regionDataset,
        { regionCode: "440304" },
        undefined,
        true,
        true,
      ).regionPathSnapshot?.map((r) => r.name),
    ).toEqual(["广东省", "深圳市", "福田区"])
    expect(() =>
      regionAddress(regionDataset, { regionCode: "440300" }, undefined, true, true),
    ).toThrow("具体区县")
    expect(
      regionAddress(regionDataset, { regionCode: "441900" }, undefined, true, true).regionCode,
    ).toBe("441900")
    expect(() => regionPath(regionDataset, "不存在")).toThrow("有效地区")
    expect(regionAddress(regionDataset, {}, { regionCode: null }, false)).toEqual({
      regionCode: null,
      regionPathSnapshot: null,
    })
    expect(() => regionAddress(regionDataset, {}, { regionCode: null }, true)).toThrow("请选择地区")
  })
  test("停用可历史查看、禁止新用，循环或断层被拒绝", () => {
    const rows = regionDataset.map((r) => (r.code === "440304" ? { ...r, enabled: false } : r))
    expect(regionPath(rows, "440304")).toHaveLength(3)
    expect(() => regionAddress(rows, { regionCode: "440304" }, undefined, true, true)).toThrow(
      "有效地区",
    )
    const broken = regionDataset.map((r) =>
      r.code === "440300" ? { ...r, parentCode: "440304" } : r,
    )
    expect(() => regionPath(broken, "440304")).toThrow("循环")
  })
  test("合同覆盖相交与所在地后代查询有不同含义", () => {
    expect(regionMatches(regionDataset, "440300", { regionCode: "440304" })).toBe(true)
    expect(regionMatches(regionDataset, "440304", { regionCode: "440300" })).toBe(false)
    expect(regionMatches(regionDataset, "440304", { regionCode: "440300" }, true)).toBe(true)
    expect(regionMatches(regionDataset, "440300", { regionCode: "330100" }, true)).toBe(false)
    expect(regionMatches(regionDataset, "440304", { regionCode: null }, true)).toBe(false)
  })
  test("新任务不采集位置，旧冻结策略保留原核验与时间检查", () => {
    const at = new Date("2026-11-05T10:00:00+08:00")
    expect(geoChecks(defaultPolicy, { status: "NOT_REQUESTED" }, at, at)).toEqual({
      flags: [],
      distance: null,
    })
    expect(
      geoChecks(defaultPolicy, { status: "NOT_REQUESTED" }, at, new Date(at.getTime() - 300000))
        .flags,
    ).toEqual(["CLOCK_SKEW"])
    expect(
      geoChecks({ ...defaultPolicy, locationCheckEnabled: true }, { status: "DENIED" }, at, at)
        .flags,
    ).toEqual(["LOCATION_DENIED", "NO_REFERENCE_POINT"])
    expect(() =>
      geoChecks(
        { ...defaultPolicy, locationCheckEnabled: true },
        { status: "NOT_REQUESTED" },
        at,
        at,
      ),
    ).toThrow("历史任务")
  })
})
