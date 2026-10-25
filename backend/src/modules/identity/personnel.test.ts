import { describe, expect, test } from "bun:test"
import { dictionaries, canSupervise, positions } from "./identity.constants"
import { validateServiceFields } from "./identity.service"

describe("领域与督导资格", () => {
  test("完整行业、细分领域及品牌目录，岗位编码稳定", () => {
    expect(dictionaries.serviceFields).toHaveLength(23)
    expect(dictionaries.subFields).toHaveLength(5)
    expect(dictionaries.brands.map((b) => b.name)).toEqual([
      "馨守护",
      "馨起点",
      "馨生活",
      "馨生剧团",
      "馨+",
    ])
    expect(positions.find((p) => p.code === "position-8")?.name).toBe("高级主任")
    expect(positions.some((p) => p.code === "position-5")).toBe(false)
  })
  test("人员多领域验证拒绝重复、空集合及无效字段", () => {
    expect(() => validateServiceFields(["社区建设", "社会福利"], true)).not.toThrow()
    expect(() => validateServiceFields([], true)).toThrow()
    expect(() => validateServiceFields(["社区建设", "社区建设"])).toThrow()
    expect(() => validateServiceFields(["无效领域"])).toThrow()
  })
  test("督导资格与岗位明确对应，不由显示顺序推导", () => {
    for (const code of [
      "position-1",
      "position-2",
      "position-3",
      "position-4",
      "position-7",
      "position-12",
    ])
      expect(canSupervise(code)).toBe(false)
    for (const code of ["position-6", "position-8", "position-9", "position-10", "position-11"])
      expect(canSupervise(code)).toBe(true)
  })
})
