import { pool } from "./index"
import { db } from "./index"
import { regionDatabaseName } from "@/modules/region/region.seed"
import { RegionNormalizationRepository } from "@/modules/region/region.normalize.repository"
try {
  const target = process.argv.find((s) => s.startsWith("--database="))?.slice(11),
    actor = process.argv.find((s) => s.startsWith("--actor="))?.slice(8)
  if (
    !target ||
    (target !== "swms" && !target.startsWith("swms_test_")) ||
    target !== process.env.DB_NAME ||
    (await regionDatabaseName(db)) !== target
  )
    throw new Error("请显式指定与连接一致的swms或swms_test_目标库")
  if (process.argv.includes("--apply") && !actor)
    throw new Error("写入前请显式指定--actor=管理员账号")
  console.log(
    JSON.stringify(
      await new RegionNormalizationRepository(db).run(
        process.argv.includes("--apply"),
        actor ?? "admin",
      ),
      null,
      2,
    ),
  )
} finally {
  await pool.end()
}
