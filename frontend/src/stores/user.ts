import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { authApi } from '@/api/modules/auth'
import type { CurrentUser, DataScope, LoginPayload } from '@/api/types'
import { clearLayout, installLayout } from '@/router'
import { filterMenuTree, menuTree } from '@/router/routes'
import { getToken, removeToken, setToken } from '@/utils/auth'

/** 数据范围的中文说法，界面上直接展示，答辩时也用来说明权限设计 */
const dataScopeLabels: Record<DataScope, string> = {
    ALL: '全部数据',
    TEAM: '本团队数据',
    SELF: '仅本人数据',
}

export const useUserStore = defineStore('user', () => {
    const token = ref(getToken())
    const profile = ref<CurrentUser | null>(null)
    /** 用户资料是否已加载：刷新页面后靠它决定要不要补拉一次 */
    const loaded = ref(false)

    const permissions = computed(() => profile.value?.permissions ?? [])
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

    /** 失效与主动退出共用清理逻辑，不再依赖登出接口成功。 */
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
