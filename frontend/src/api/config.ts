/**
 * 接口层开关。
 *
 * 默认走本地 mock（src/mock），这样在后端表结构落地前也能把页面和权限跑起来。
 * 要连真实后端，把 frontend/.env 里的 VITE_USE_MOCK 设成 false 即可，页面代码不用动。
 */
export const useMock = import.meta.env.VITE_USE_MOCK !== 'false'

/** 接口基础路径：开发时由 vite 代理转发到后端（见 vite.config.ts） */
export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api'
