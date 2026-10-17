import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

import { setupRequestAuth } from '@/api/request'
import router from '@/router'
import { setupRouterGuard } from '@/router/guard'
import { useUserStore } from '@/stores/user'

import App from './App.vue'

import '@/style.css'
import '@/styles/theme.css'

const app = createApp(App)

const pinia = createPinia()

// pinia 要先装：路由守卫里会用到用户 store
app.use(pinia)
setupRequestAuth(() => {
    const current = router.currentRoute.value
    const userStore = useUserStore(pinia)
    const hadProfile = userStore.loaded
    userStore.resetSession()
    // 首次恢复资料失败由守卫处理，保留正在进入的目标地址。
    if (hadProfile && current.path !== '/login') {
        void router.replace({ path: '/login', query: { redirect: current.fullPath } })
    }
})
setupRouterGuard()
app.use(router)

// 全局注册图标组件，必须在挂载应用之前完成。
for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(name, component)
}

app.mount('#app')
