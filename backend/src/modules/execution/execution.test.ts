import { describe, expect, test } from "bun:test"
import { defaultPolicy, distanceMeters, geoChecks, validatePolicy } from "./execution-geo"
describe("现场定位与策略", () => {
  const at = new Date("2026-11-03T10:00:00+08:00")
  test("WGS84距离、精度、旧采样与设备时钟分别标记", () => {
    expect(distanceMeters({ latitude: 23, longitude: 113 }, { latitude: 23, longitude: 113 })).toBe(
      0,
    )
    expect(
      distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }),
    ).toBeCloseTo(111195, -1)
    const p = { ...defaultPolicy, locationCheckEnabled: true, latitude: 23, longitude: 113 }
    const result = geoChecks(
      p,
      {
        status: "OK",
        latitude: 23.01,
        longitude: 113,
        accuracy: 200,
        sampledAt: "2026-11-03T09:50:00+08:00",
      },
      at,
      new Date(at.getTime() - 600000),
    )
    expect(result.flags).toEqual(["LOCATION_STALE", "LOW_ACCURACY", "OUTSIDE_RANGE", "CLOCK_SKEW"])
    expect(result.distance).toBeGreaterThan(1000)
  })
  test("定位失败与无参考点保留为异常，不填充假坐标", () => {
    expect(
      geoChecks({ ...defaultPolicy, locationCheckEnabled: true }, { status: "DENIED" }, at, at),
    ).toEqual({
      distance: null,
      flags: ["LOCATION_DENIED", "NO_REFERENCE_POINT"],
    })
    expect(() =>
      geoChecks({ ...defaultPolicy, locationCheckEnabled: true }, { status: "OK" }, at, at),
    ).toThrow("定位数据")
    expect(() => validatePolicy({ ...defaultPolicy, latitude: 23 })).toThrow("成对")
    expect(() => validatePolicy({ ...defaultPolicy, supplementHours: 73 })).toThrow("范围")
    expect(() => validatePolicy(defaultPolicy)).not.toThrow()
  })
})
