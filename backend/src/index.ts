import { app } from "@/app"
import { env } from "@/utils/env"

if (!env.jwtSecret) throw new Error("请在 backend/.env 配置 JWT_SECRET")

app.listen(env.port)

const { hostname, port } = app.server ?? {}

console.log(`🦊 温馨社工服务管理系统 API 已启动：http://${hostname}:${port}`)
console.log(`📘 接口文档：http://${hostname}:${port}/docs`)
