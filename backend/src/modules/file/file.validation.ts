import { AppError } from "@/utils/errors"
/** 允许的合同格式按实际文件头验证，避免只依赖浏览器提供的类型。 */
export function contractFileType(name: string, bytes: Uint8Array): string {
  const extension = name.split(".").at(-1)?.toLowerCase()
  const starts = (...prefix: number[]) => prefix.every((v, i) => bytes[i] === v)
  if (extension === "pdf" && starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"
  if (extension === "png" && starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
    return "image/png"
  if (["jpg", "jpeg"].includes(extension ?? "") && starts(0xff, 0xd8, 0xff)) return "image/jpeg"
  if (extension === "docx" && starts(0x50, 0x4b, 0x03, 0x04))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  if (extension === "doc" && starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1))
    return "application/msword"
  throw AppError.badRequest("仅支持内容有效的 PDF、PNG、JPG、DOC 和 DOCX 合同文件")
}
