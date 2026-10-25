import { describe, expect, test } from "bun:test"
import { contractFileType } from "./file.validation"
describe("合同附件内容校验", () => {
  test("支持真实PDF与图片文件头，拒绝后缀伪造和可执行文件", () => {
    expect(contractFileType("合同.PDF", new TextEncoder().encode("%PDF-1.7"))).toBe(
      "application/pdf",
    )
    expect(contractFileType("照片.png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(
      "image/png",
    )
    expect(() => contractFileType("伪造.pdf", new TextEncoder().encode("<script>"))).toThrow()
    expect(() => contractFileType("程序.exe", new Uint8Array([77, 90]))).toThrow()
  })
})
