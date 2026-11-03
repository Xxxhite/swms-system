import type { ExecutionPolicy, GeoSample } from "@/db/schema"
import { AppError } from "@/utils/errors"
export const defaultPolicy: ExecutionPolicy = {
  latitude: null,
  longitude: null,
  radius: 200,
  accuracyLimit: 100,
  beforeMinutes: 30,
  afterMinutes: 120,
  toleranceMinutes: 15,
  credentialMinutes: 30,
  supplementHours: 72,
  pointId: null,
  pointVersion: null,
}
export function validatePolicy(p: ExecutionPolicy) {
  if (
    (p.latitude === null) !== (p.longitude === null) ||
    (p.latitude !== null && (!Number.isFinite(p.latitude) || Math.abs(p.latitude) > 90)) ||
    (p.longitude !== null && (!Number.isFinite(p.longitude) || Math.abs(p.longitude) > 180))
  )
    throw AppError.badRequest("请输入成对的有效WGS84经纬度")
  for (const [value, min, max] of [
    [p.radius, 50, 5000],
    [p.accuracyLimit, 10, 1000],
    [p.beforeMinutes, 0, 120],
    [p.afterMinutes, 0, 360],
    [p.toleranceMinutes, 0, 120],
    [p.credentialMinutes, 5, 60],
    [p.supplementHours, 1, 72],
  ])
    if (!Number.isInteger(value) || value < min || value > max)
      throw AppError.badRequest("现场规则数值超出允许范围")
}
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = (n: number) => (n * Math.PI) / 180,
    lat = rad(b.latitude - a.latitude),
    lng = rad(b.longitude - a.longitude)
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(lng / 2) ** 2
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))))
}
export function geoChecks(
  policy: ExecutionPolicy,
  geo: GeoSample,
  receivedAt: Date,
  declaredAt: Date,
) {
  const flags: string[] = []
  let distance: number | null = null
  if (geo.status !== "OK") flags.push(`LOCATION_${geo.status}`)
  else {
    if (
      geo.latitude === undefined ||
      geo.longitude === undefined ||
      geo.accuracy === undefined ||
      !geo.sampledAt ||
      !Number.isFinite(geo.latitude) ||
      !Number.isFinite(geo.longitude) ||
      !Number.isFinite(geo.accuracy) ||
      Math.abs(geo.latitude) > 90 ||
      Math.abs(geo.longitude) > 180 ||
      geo.accuracy < 0
    )
      throw AppError.badRequest("定位数据不完整或无效")
    const sample = Date.parse(geo.sampledAt)
    if (!Number.isFinite(sample)) throw AppError.badRequest("定位采样时间无效")
    if (Math.abs(receivedAt.getTime() - sample) > 120000) flags.push("LOCATION_STALE")
    if (geo.accuracy > policy.accuracyLimit) flags.push("LOW_ACCURACY")
    if (policy.latitude !== null && policy.longitude !== null) {
      distance = distanceMeters(
        { latitude: policy.latitude, longitude: policy.longitude },
        { latitude: geo.latitude, longitude: geo.longitude },
      )
      if (distance > policy.radius) flags.push("OUTSIDE_RANGE")
    }
  }
  if (policy.latitude === null || policy.longitude === null) flags.push("NO_REFERENCE_POINT")
  if (Math.abs(receivedAt.getTime() - declaredAt.getTime()) > 120000) flags.push("CLOCK_SKEW")
  return { flags, distance }
}
export const exceptionLabels: Record<string, string> = {
  LOCATION_DENIED: "定位授权被拒绝",
  LOCATION_UNAVAILABLE: "定位不可用",
  LOCATION_TIMEOUT: "定位超时",
  LOCATION_UNSUPPORTED: "设备未提供定位",
  LOCATION_STALE: "定位采样过旧",
  LOW_ACCURACY: "定位精度不足",
  OUTSIDE_RANGE: "偏离服务范围",
  NO_REFERENCE_POINT: "未设参考点",
  CLOCK_SKEW: "设备时间偏移",
  LATE: "到岗迟于计划",
  EARLY: "离岗早于计划",
  MISSING_CHECKOUT: "缺少离岗记录",
  SUPPLEMENT: "补录待核验",
  CORRECTION: "更正待核验",
  ASSISTED: "辅助确认待核验",
  VOID: "参与作废待核验",
}
