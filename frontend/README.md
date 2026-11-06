# 前端

Vue 3 + TypeScript + Vite，使用 Element Plus、Pinia 和 Vue Router。

## 开发

运行环境为 Bun 和 Node.js。

在 `frontend/` 目录执行：

```bash
bun install
```

复制 `.env.example` 为本地 `.env`，再启动：

```bash
bun run dev
```

默认地址为 `http://127.0.0.1:5173/#/dashboard`。

- 默认使用 mock，演示账号见登录页。
- 连接后端时设置 `VITE_USE_MOCK=false`、`VITE_API_BASE_URL=/api`；开发代理指向 `http://127.0.0.1:3000`。
- 环境变量在构建时生效；修改本地配置后重启开发服务。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `bun run check` | 类型、代码规范、格式及单元测试 |
| `bun run build` | 类型检查并生成 `dist/` |
| `bun run preview` | 预览构建产物 |

## 源码

`src/views/` 为业务页面，`components/` 为公共组件，`layouts/` 为布局；`api/`、`mock/` 分别维护真实接口与演示数据，`router/`、`stores/` 管理导航和会话，`tests/` 保存自动化测试。

菜单与权限入口集中在 `src/router/routes.ts`、`src/api/permissions.ts`。Element Plus 按需导入，统一配置在 `src/App.vue`，主题变量在 `src/styles/theme.css`。`src/types/` 中的组件／自动导入声明由插件生成。

后端配置见 [后端说明](../backend/README.md)，项目概览见[根目录说明](../README.md)。
