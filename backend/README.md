# 后端

Bun + Elysia + TypeScript，使用 Drizzle ORM 访问 MySQL。业务接口统一位于 `/api`，响应格式为 `{ code, message, data }`，成功码为 `0`。

## 首次运行

先创建 MySQL 数据库及应用账号，在 `backend/` 目录安装依赖：

```bash
bun install
```

复制 `.env.example` 为本地 `.env`，填写数据库连接、`JWT_SECRET` 和初始化管理员密码 `SEED_ADMIN_PASSWORD`。数据库名以下以 `swms` 为例。

```bash
bun run db:migrate
bun run db:seed:regions --database=swms
bun run db:seed:regions --database=swms --apply
bun run db:seed
bun run dev
```

地区初始化先预览，再用 `--apply` 写入；目标名必须与环境配置的数据库一致。常规初始化保留已有账号密码。已有环境升级时先备份，再应用目标版本迁移及对应的权限／地区补充脚本。

默认监听 `http://127.0.0.1:3000`，健康检查为 `/health`，接口文档为 `/docs`。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `bun run check` | 类型、代码规范、格式及常规测试 |
| `bun run db:generate` | 从 schema 生成正式迁移 |
| `bun run db:migrate` | 应用正式迁移 |
| `bun run db:studio` | 查看数据库 |
| `bun run test:integration --timeout=20000` | 验收独立 MySQL 测试库 |

集成测试须设置 `TEST_DB_NAME=swms_test_…`；已有测试库需显式设置 `TEST_DB_RESET=1`。常规检查默认跳过数据库集成用例。`db:push` 用于开发试验，正式结构变更使用迁移。

## 已有环境升级与验收

先核对目标版本的正式迁移，再预览相应缺失权限；管理跟进与质量反馈分别使用：

```bash
bun run db:seed:management-permissions
bun run db:seed:feedback-permissions
```

核对差异后给对应命令追加 `--apply`，只补缺失目录和默认角色授权。地区、资源、任务和执行权限使用各自显式脚本，保留已有账号、密码及自定义授权。

当前源码基线为62张业务表、13份迁移（至0012）。集成、演示重建与浏览器业务写入需串行使用独立测试库；重建会清除目标库虚构数据。实际资料部署时应在稳定窗口联合保存数据库、合同与执行附件；恢复先使用独立目标，对照原数据、审批量、权限和文件，再决定切换，步骤见部署说明。

## 源码与数据

- `src/app.ts` 装配应用，`src/index.ts` 启动监听。
- `src/modules/` 按业务划分，路由、业务规则和数据库访问分层；共用事务仓储直接复用。
- `src/db/schema/` 定义表结构，`drizzle/` 保存正式迁移及元数据，`src/db/data/` 保存地区字典。
- 测试与模块源码相邻，命名为 `*.test.ts`；集成场景由身份集成入口统一装配。

## 后端编码约定

采用 Elysia 1.4 的[官方最佳实践](https://elysiajs.com/essential/best-practice)，按业务模块组织：

- `xxx.route.ts` 声明 HTTP 路由、参数模型及认证要求，处理请求与响应。
- `xxx.validation.ts` 承担 Model 职责，集中 TypeBox 模型，并用 `Static<typeof schema>` 推导输入类型。
- `xxx.service.ts` 接收明确的业务参数，维护规则、状态及仓储调用；`xxx.repository.ts` 负责数据库访问。
- 路由通过 `.use(createAuthentication(...))` 显式声明依赖；`auth: "active"` 要求启用账号，`auth: "restricted"` 仅用于本人资料、申请重提和退出等白名单。
- 认证 macro 在参数校验后注入类型化 `actor`；同一要求的地区路由使用 `.guard({ auth: "active" })`。动作权限、数据范围与实际职责继续由业务服务校验。
- 认证与地区模块已采用上述写法。其他模块暂沿用同一插件提供的 `authenticate()`，按确认批次迁移。

路由保持当前版本的 `method(path, handler, options)` 调用顺序。测试通过注入身份服务、仓储或测试密钥隔离依赖，使用 `app.handle(new Request(...))` 验证响应及拒绝路径。排版由现有 ESLint、Prettier 统一。

合同及执行附件默认位于 `storage/contracts/`、`storage/execution/`，通过受控接口访问。配置与示例见 [.env.example](.env.example)，部署时将附件放在版本目录之外，并与数据库联合备份。

项目概览见[根目录说明](../README.md)，部署步骤见[部署说明](../deploy/README.md)。
