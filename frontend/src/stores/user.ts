import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { authApi } from '@/api/modules/auth'
import type { CurrentUser, DataScope, LoginPayload } from '@/api/types'
import { clearLayout, installLayout } from '@/router'
import { filterMenuTree, menuTree } from '@/router/routes'
import { getToken, removeToken, setToken } from '@/utils/auth'

/** 数据范围编码对应的界面展示文本 */
const dataScopeLabels: Record<DataScope, string> = {
    ALL: '全部数据',
    TEAM: '本团队数据',
    SELF: '仅本人数据',
}

export const useUserStore = defineStore('user', () => {
    const token = ref(getToken())
    const profile = ref<CurrentUser | null>(null)
    /** 用户资料加载标志；路由守卫据此决定是否恢复资料与权限路由 */
    const loaded = ref(false)

    const permissions = computed(() => profile.value?.permissions ?? [])
    // 侧栏与工作台共用过滤后的菜单，保持功能入口与动态路由权限一致。
    const menus = computed(() => filterMenuTree(menuTree, permissions.value))
    const dataScopeText = computed(() => {
        const scope = profile.value?.dataScope
        if (!scope) return ''
        return scope === 'TEAM'
            ? `${dataScopeLabels[scope]}（${profile.value?.teamName ?? ''}）`
            : dataScopeLabels[scope]
    })

    /** 按钮级权限判断，用法：v-if="userStore.hasPermission('system:view')" */
    function hasPermission(code?: string): boolean {
        return !code || permissions.value.includes(code)
    }

    /** 应用用户资料时同步安装权限路由，避免资料与可访问页面不一致。 */
    function applyProfile(user: CurrentUser): void {
        profile.value = user
        loaded.value = true
        installLayout(user.permissions)
    }

    async function login(payload: LoginPayload): Promise<void> {
        const result = await authApi.login(payload)
        setToken(result.token)
        token.value = result.token
        applyProfile(result.user)
    }

    /** 刷新页面后用本地 token 恢复登录态 */
    async function loadProfile(): Promise<void> {
        const currentToken = token.value
        const user = await authApi.profile()
        // 防止退出或切换账号时，旧请求重新恢复上一份用户资料。
        if (!token.value || token.value !== currentToken) throw new Error('登录状态已变更')
        applyProfile(user)
    }

    /** 清理本地凭证、用户资料与动态路由，供会话失效和主动退出共用。 */
    function resetSession(): void {
        removeToken()
        token.value = ''
        profile.value = null
        loaded.value = false
        clearLayout()
    }

    async function logout(): Promise<void> {
        try {
            await authApi.logout()
        } finally {
            // 登出接口失败时仍清理本地会话。
            resetSession()
        }
    }

    return {
        token,
        profile,
        loaded,
        permissions,
        menus,
        dataScopeText,
        hasPermission,
        login,
        loadProfile,
        resetSession,
        logout,
    }
})
