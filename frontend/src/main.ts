import {createPinia} from 'pinia'
import {createApp} from 'vue'

import router from './router'
import {setupRouterGuard} from './router/guard'
import ElementPlus from 'element-plus'
import zhCN from 'element-plus/es/locale/lang/zh-cn'

import App from './App.vue'

import 'element-plus/theme-chalk/dark/css-vars.css'

const app = createApp(App)

const pinia = createPinia()

// pinia 要先装：路由守卫里会用到用户 store
app.use(pinia)
app.use(router)
setupRouterGuard()
app.use(ElementPlus, {size: 'small', zIndex: 3000, locale: zhCN})
app.mount('#app')
