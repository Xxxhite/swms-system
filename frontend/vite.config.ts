import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

import { fileURLToPath, URL } from 'node:url'

import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        vue(),
        AutoImport({
            resolvers: [ElementPlusResolver()],
            // 自动生成的声明文件统一放到 src/types，项目根目录保持干净
            dts: 'src/types/auto-imports.d.ts',
        }),
        Components({
            resolvers: [ElementPlusResolver()],
            dts: 'src/types/components.d.ts',
        }),
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    server: {
        proxy: {
            // 开发时把 /api 转发到后端，避免跨域；mocked 模式下这条用不到
            '/api': {
                target: 'http://127.0.0.1:3000',
                changeOrigin: true,
            },
        },
    },
})
