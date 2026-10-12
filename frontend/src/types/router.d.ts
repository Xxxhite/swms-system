import 'vue-router'

/** 路由 meta 的字段约定，供侧边菜单、面包屑和路由守卫使用 */
declare module 'vue-router' {
    interface RouteMeta {
        /** 页面标题 */
        title?: string
        /** 面包屑的上级标题链 */
        parents?: string[]
        /** 免登录页面 */
        public?: boolean
    }
}
