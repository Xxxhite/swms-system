/**
 * 环境变量读取与默认值。
 * 约定：新增环境变量时同步更新 backend/.env.example（仓库约定，见 AGENTS 约定文档）。
 */

function toPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: toPositiveInt(process.env.PORT, 3000),
  jwtSecret: process.env.JWT_SECRET?.trim() ?? "",
  jwtExpiresSeconds: toPositiveInt(process.env.JWT_EXPIRES_SECONDS, 28800),
  /**
   * 允许跨域的前端地址，多个用英文逗号分隔。
   * 默认放本机 Vite 的 localhost 与 127.0.0.1 两种访问地址；
   * 凭证走请求头，CORS credentials 显式关闭。
   */
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const

export const isDev = env.nodeEnv !== "production"
