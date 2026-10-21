import { AppError } from "./errors"
/** 将最多两位小数的非负十进制文本转为百分位整数，避免浮点误差。 */
export function decimalUnits(value: string, positive = false, digits = 10): bigint {
  if (!new RegExp(`^(0|[1-9][0-9]{0,${digits - 1}})(\\.[0-9]{1,2})?$`).test(value))
    throw AppError.badRequest("数量须为范围内最多两位小数的非负文本")
  const [whole, fraction = ""] = value.split(".")
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))
  if (positive && result === 0n) throw AppError.badRequest("目标须大于零")
  return result
}
/** 将百分位整数还原为固定两位小数，可安全用于 JSON 及数据库。 */
export function decimalText(value: bigint): string {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`
}
