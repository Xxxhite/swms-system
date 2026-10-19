/**
 * 接口层开关。
 *
 * VITE_USE_MOCK 仅在值为字符串 false 时关闭，其余情况使用本地 mock 适配器。
 * 请求接口保持一致，由请求层选择 mock 或真实 HTTP 传输。
 */
export const useMock = import.meta.env.VITE_USE_MOCK !== 'false'

/** 接口基础路径：开发时由 vite 代理转发到后端（见 vite.config.ts） */
export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api'
