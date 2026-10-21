# Linux 部署与更新

适用于 Ubuntu 24.04、域名 `swms.sopak.space`、部署账号 `Xxxhite`。
前端在本机构建，服务器使用 Bun、MySQL、Nginx 和 systemd。
既有博客和其他服务继续使用各自配置。新增配置仅使用此项目的名称和路径。

## 目录与权限

```text
/srv/swms/
├── releases/<发布编号>/    # 后端源码、迁移、前端 dist、部署文件
├── current -> releases/…  # 正在运行的版本
├── assets/                # 历次发布的带哈希前端资源，供旧页面继续加载
├── runtime/bun/           # 固定版本 Bun，仅部署账号可访问
├── shared/backend.env     # 服务器独立配置，权限 600
└── backups/               # 数据库备份，仅部署账号和管理员访问
```

发布目录和静态资源需要 Nginx 用户可读、可遍历；环境文件、备份和运行时目录为私有。
systemd 以 `Xxxhite` 运行，读取共享环境文件；后端仅监听 `127.0.0.1:3000`。
Nginx 保留 `/api` 路径前缀，域名根目录提供 hash 路由页面。
`/health` 可经站点检查，`/docs` 在后端本机检查，公网未配置文档代理。

## 首次服务器准备（管理员）

在服务器上审阅后执行上传的脚本：

```bash
sudo bash /home/Xxxhite/swms-bootstrap/prepare-server.sh
```

脚本安装 MySQL 和必要工具、限制 MySQL 初始内存配置、建立目录、独立数据库及账号，
生成独立 JWT 密钥和随机初始化密码。密码不打印、不复用本地配置。
已有 `backend.env`、同名数据库或数据库账号时会停止，不自动覆盖。
MySQL 初始缓冲池为 128 MiB、连接上限为 20；结合实际内存观测再调整。
此脚本用于首次准备，不用于日常更新。

## 安装运行时（部署账号）

Bun 与本地验证版本保持一致，初始固定为 `1.3.14`：

```bash
curl -fsSL https://bun.sh/install -o /srv/swms/runtime/install-bun.sh
BUN_INSTALL=/srv/swms/runtime/bun bash /srv/swms/runtime/install-bun.sh bun-v1.3.14
/srv/swms/runtime/bun/bin/bun --version
```

升级 Bun 时重新运行两端检查与集成测试，再同步固定版本。
官方安装说明：<https://bun.sh/docs/installation>。

## 本机验证与打包

先分别在 `backend` 和 `frontend` 执行 `bun run check`。
前端设置 `VITE_USE_MOCK=false`、`VITE_API_BASE_URL=/api` 后执行 `bun run build`。
这两项变量会编入构建产物，服务器启动时修改不会改变已构建页面。

发布优先使用已确认提交的版本。尚未提交时，明确标记为工作区快照，并记录基准提交、
发布编号及压缩包 SHA256；不把工作区快照当作对应提交的完整内容。

在仓库根目录执行以下 PowerShell，`$releaseId` 每次使用新的编号：

```powershell
$releaseId = '20261021-01'
$releaseArchive = Join-Path $env:TEMP "swms-$releaseId.tar.gz"
tar -czf $releaseArchive backend/src backend/drizzle backend/bun.lock backend/package.json backend/tsconfig.json backend/drizzle.config.ts backend/.env.example frontend/dist deploy
Get-FileHash $releaseArchive -Algorithm SHA256
```

只打包列出的路径。`.env`、`.docs`、私钥、`.git`、本地数据库和 `node_modules` 均不在包内。
上传压缩包后核对 `sha256sum` 与本机值一致，再解压到新的发布目录。
该包包含 Linux 上安装后端依赖所需的锁文件，不能上传 Windows 的 `node_modules`。

## 准备发布目录（部署账号）

以下示例中的编号与压缩包名须保持一致：

```bash
release_id=20261021-01
release_dir=/srv/swms/releases/$release_id
test ! -e "$release_dir"
mkdir "$release_dir"
tar -xzf "$HOME/swms-bootstrap/swms-$release_id.tar.gz" -C "$release_dir"
ln -s /srv/swms/shared/backend.env "$release_dir/backend/.env"
cd "$release_dir/backend"
# 服务环境为 production，安装过程显式保留迁移工具所在的开发依赖。
NODE_ENV=development /srv/swms/runtime/bun/bin/bun install --frozen-lockfile
cp -an "$release_dir/frontend/dist/assets/." /srv/swms/assets/
chmod 0755 "$release_dir" "$release_dir/frontend" "$release_dir/frontend/dist" /srv/swms/assets
find "$release_dir/frontend/dist" /srv/swms/assets -type d -exec chmod 0755 {} +
find "$release_dir/frontend/dist" /srv/swms/assets -type f -exec chmod 0644 {} +
```

部署账号的 shell 如启用了 `set -e`，上述存在性保护会终止重复解压；交互执行时发现任一步失败应停止。
依赖、资源全部准备好后再切换版本，避免安装失败影响正在运行的版本。

## 第一次迁移、初始化与上线

在新发布目录的 `backend` 中执行：

```bash
/srv/swms/runtime/bun/bin/bun run db:migrate
/srv/swms/runtime/bun/bin/bun run db:seed:projects
```

第二条只在首次需要虚构演示数据时执行，创建身份账号、业务权限、虚构项目及月报。
不需要演示账号时，改用 `db:seed` 和 `db:seed:business-permissions`。
用户在自己的终端查看 `shared/backend.env` 中的初始化密码；不将其粘贴到聊天或提交仓库。

确认初始化成功后，由部署账号设置首次 `current`：

```bash
test ! -e /srv/swms/current
ln -s "$release_dir" /srv/swms/current
```

再由管理员执行：

```bash
sudo install -m 0644 /srv/swms/current/deploy/systemd/swms-api.service /etc/systemd/system/swms-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now swms-api
sudo systemctl status swms-api --no-pager
curl --fail http://127.0.0.1:3000/health
curl --fail --output /dev/null http://127.0.0.1:3000/docs

# 首次安装专用站点；如果文件已存在，先检查差异，不覆盖 Certbot 修改后的 HTTPS 配置。
test ! -e /etc/nginx/sites-available/swms
sudo install -m 0644 /srv/swms/current/deploy/nginx/swms.conf /etc/nginx/sites-available/swms
sudo ln -s /etc/nginx/sites-available/swms /etc/nginx/sites-enabled/swms
sudo nginx -t
sudo systemctl reload nginx
curl --fail -H 'Host: swms.sopak.space' http://127.0.0.1/health
sudo certbot --nginx -d swms.sopak.space --redirect
sudo certbot renew --dry-run
```

Certbot 会交互询问邮箱及服务条款，由管理员完成。
Nginx 配置有误时先修复再 reload；不要重写既有博客或默认站点配置。
反向代理规则参考 <https://nginx.org/en/docs/http/ngx_http_proxy_module.html>，
服务托管参考 <https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html>。

## 日常更新

1. 本地开发、检查、浏览器验收，确认文件清单和提交后由用户推送；记录发布提交号。
2. 构建、打包、上传、校验 SHA256，按前文准备新发布目录及其依赖和静态资源。
3. 记录 `readlink -f /srv/swms/current`，创建维护标记并停止后端，阻止备份后继续写入。
4. 管理员备份数据库；保存上一版环境配置，环境文件备份仅放在私有备份目录。
5. 在新版本 `backend` 执行 `db:migrate`。迁移失败时保持维护状态，先核对库状态。
6. 原子切换 `current`，管理员启动后端；先从本机验证，再移除维护标记。
7. 验收 HTTPS、登录与权限、月报审批、Excel；记录版本、时间、备份位置和结果。

维护与备份示例：

```bash
touch /srv/swms/maintenance
sudo systemctl stop swms-api
sudo bash -c 'set -euo pipefail; umask 077; backup_dir=/srv/swms/backups/$(date -u +%Y%m%dT%H%M%SZ); mkdir "$backup_dir"; mysqldump --single-transaction --routines --triggers --events --set-gtid-purged=OFF --no-tablespaces swms | gzip > "$backup_dir/swms.sql.gz"; gzip -t "$backup_dir/swms.sql.gz"; cp /srv/swms/shared/backend.env "$backup_dir/backend.env"; readlink -f /srv/swms/current > "$backup_dir/release.txt"; sha256sum "$backup_dir/swms.sql.gz" > "$backup_dir/SHA256SUMS"; chown -R Xxxhite:Xxxhite "$backup_dir"'
```

切换版本（部署账号，在新版本迁移成功后执行）：

```bash
test ! -e /srv/swms/current.next
ln -s "$release_dir" /srv/swms/current.next
mv -Tf /srv/swms/current.next /srv/swms/current
sudo systemctl start swms-api
curl --fail http://127.0.0.1:3000/health
# 上一步成功且日志正常后再恢复业务请求。
rm /srv/swms/maintenance
```

Nginx 静态目录会随 `current` 切换，日常代码更新无需重新覆盖 HTTPS 配置。
服务文件变化时单独审阅并重新安装、`daemon-reload`；环境变化时先更新共享配置再重启。
日常更新不重复生成迁移、不执行 `db:push`，不自动执行 seed 或清库测试。

## 回退与验证

仅代码变化或数据库与旧代码兼容时，在维护状态切回记录的旧发布目录并重启。
数据库迁移执行后先核对兼容性；不假定切回代码会撤销数据库变化。
需要恢复数据库时由管理员停服务、保留失败现场备份、核对原备份校验值，
再导入备份并恢复匹配版本。恢复使用备份时点的数据，期间产生的数据需另外处理。
上线后保留至少上一版代码、资源和数据库备份。

```bash
sudo journalctl -u swms-api -n 100 --no-pager
curl --fail https://swms.sopak.space/health
ss -ltn
free -h
```

确认 API 监听本机 3000、MySQL 监听本机 3306；通过已有安全组和防火墙维持网站与 SSH 入口。
首次验收包括管理员登录、注册短密码提示、审核入口、项目列表与详情、月报、主管审批、真实 Excel 下载。
目前文件上传属于后续阶段；实现后将文件目录放到 `shared` 并扩展备份、恢复和 Nginx 限制。
