import { grantTaskPermissions } from "@/modules/task/task.seed"
import { grantResourcePermissions } from "@/modules/resource/resource.seed"
import { seedProjects, grantBusinessPermissions } from "@/modules/project/project.seed.repository"
import { db, pool } from "./index"
import { seedIdentity } from "@/modules/identity/identity.seed.repository"

// 显式初始化入口：从本地环境取密码，完成或失败后均关闭数据库连接池。
try {
  if (process.argv.includes("--task-permissions")) {
    console.log(
      JSON.stringify(await grantTaskPermissions(db, process.argv.includes("--apply")), null, 2),
    )
  } else if (process.argv.includes("--resource-permissions")) {
    console.log(
      JSON.stringify(await grantResourcePermissions(db, process.argv.includes("--apply")), null, 2),
    )
  } else {
    await seedIdentity(db, {
      adminUsername: process.env.SEED_ADMIN_USERNAME ?? "admin",
      adminPassword: process.env.SEED_ADMIN_PASSWORD ?? "",
      ...(process.argv.includes("--demo")
        ? { demoPassword: process.env.SEED_DEMO_PASSWORD ?? "" }
        : {}),
    })
    if (process.argv.includes("--business-permissions")) await grantBusinessPermissions(db)
    if (process.argv.includes("--projects"))
      await seedProjects(db, process.env.SEED_ADMIN_USERNAME ?? "admin")
    console.log(
      process.argv.includes("--projects")
        ? "身份与虚构项目初始化完成；已有账号和密码保持原样"
        : process.argv.includes("--business-permissions")
          ? "业务权限补充完成；已有授权保持原样"
          : "身份初始化完成；已有账号和密码保持原样",
    )
  }
} finally {
  await pool.end()
}
