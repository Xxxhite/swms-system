/**
 * 环境变量读取与默认值。
 * 约定：新增环境变量时同步更新 backend/.env.example（仓库约定，见 AGENTS 约定文档）。
 */

function toPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: toPositiveInt(process.env.PORT, 3000),
  /**
   * 允许跨域的前端地址，多个用英文逗号分隔。
   * 默认只放开发用的 Vite 地址，别用 "*"：带 credentials 的跨域请求不允许通配源。
   */
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const

export const isDev = env.nodeEnv !== "production"
