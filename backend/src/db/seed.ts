import { db, pool } from "./index"
import { seedIdentity } from "@/modules/identity/identity.seed.repository"

// 显式初始化入口：从本地环境取密码，完成或失败后均关闭数据库连接池。
try {
  await seedIdentity(db, {
    adminUsername: process.env.SEED_ADMIN_USERNAME ?? "admin",
    adminPassword: process.env.SEED_ADMIN_PASSWORD ?? "",
    ...(process.argv.includes("--demo")
      ? { demoPassword: process.env.SEED_DEMO_PASSWORD ?? "" }
      : {}),
  })
  console.log("身份初始化完成；已有账号和密码保持原样")
} finally {
  await pool.end()
}
