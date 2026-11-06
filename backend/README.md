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

## 源码与数据

- `src/app.ts` 装配应用，`src/index.ts` 启动监听。
- `src/modules/` 按业务划分，路由、业务规则和数据库访问分层；共用事务仓储直接复用。
- `src/db/schema/` 定义表结构，`drizzle/` 保存正式迁移及元数据，`src/db/data/` 保存地区字典。
- 测试与模块源码相邻，命名为 `*.test.ts`；集成场景由身份集成入口统一装配。

合同及执行附件默认位于 `storage/contracts/`、`storage/execution/`，通过受控接口访问。配置与示例见 [.env.example](.env.example)，部署时将附件放在版本目录之外，并与数据库联合备份。

项目概览见[根目录说明](../README.md)，部署步骤见[部署说明](../deploy/README.md)。
