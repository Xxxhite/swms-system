import { createPinia } from 'pinia'
import { createApp } from 'vue'

import router from './router'
import { setupRouterGuard } from './router/guard'
import { setupRequestAuth } from '@/api/request'
import { useUserStore } from '@/stores/user'
import ElementPlus from 'element-plus'
import zhCN from 'element-plus/es/locale/lang/zh-cn'

import App from './App.vue'

import 'element-plus/theme-chalk/dark/css-vars.css'

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
app.use(ElementPlus, { size: 'small', zIndex: 3000, locale: zhCN })
app.mount('#app')
