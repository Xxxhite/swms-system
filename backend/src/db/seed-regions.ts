import { db, pool } from "./index"
import { seedRegions, regionDatabaseName } from "@/modules/region/region.seed"
try {
  const target = process.argv.find((s) => s.startsWith("--database="))?.slice(11)
  if (
    !target ||
    (target !== "swms" && !target.startsWith("swms_test_")) ||
    target !== process.env.DB_NAME ||
    (await regionDatabaseName(db)) !== target
  )
    throw new Error("请显式指定与连接一致的swms或swms_test_目标库")
  console.log(JSON.stringify(await seedRegions(db, process.argv.includes("--apply"))))
} finally {
  await pool.end()
}
