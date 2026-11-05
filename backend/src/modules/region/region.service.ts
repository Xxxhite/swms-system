import { createHash } from "node:crypto"
import { RegionRepository } from "./region.repository"
import { regionPath, regionTree } from "./region.shared"
export class RegionService {
  constructor(readonly repository = new RegionRepository()) {}
  async tree() {
    const rows = await this.repository.list()
    return {
      dataVersion: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
      tree: regionTree(rows),
    }
  }
  async path(code: string) {
    return regionPath(await this.repository.list(), code)
  }
}
