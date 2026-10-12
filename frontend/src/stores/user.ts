import {defineStore} from 'pinia'
import {computed, ref} from 'vue'

import {authApi} from '@/api/modules/auth'
import type {CurrentUser, DataScope, LoginPayload} from '@/api/types'
import {clearLayout, installLayout} from '@/router'
import {filterMenuTree, menuTree} from '@/router/routes'
import {getToken, removeToken, setToken} from '@/utils/auth'

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
        applyProfile(await authApi.profile())
    }

    async function logout(): Promise<void> {
        try {
            await authApi.logout()
        } finally {
            removeToken()
            token.value = ''
            profile.value = null
            loaded.value = false
            clearLayout()
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
        logout,
    }
})
