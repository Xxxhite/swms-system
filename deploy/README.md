# Linux 部署与更新

适用于 Ubuntu 24.04、Bun、MySQL、Nginx 和 systemd。前端在本机构建，服务器安装 Linux 后端依赖。
仓库保留通用模板和步骤；实际域名、账号、配置及发布记录由部署者单独保存。

## 配置范围与目录

| 文件 | 用途 |
| --- | --- |
| `nginx/swms.conf.template` | 独立 HTTP 站点模板，HTTPS 由 Certbot 配置 |
| `systemd/swms-api.service.template` | 后端服务模板 |
| `prepare-server.sh` | 接收部署参数，首次准备数据库和目录 |
| `generated/` | 实际生成的配置，已由根目录 `.gitignore` 忽略 |

默认目录 `/srv/swms`：

```text
/srv/swms/
├── releases/<发布编号>/    # 后端、迁移、前端 dist、部署文件
├── current -> releases/…  # 当前版本
├── assets/                # 历次带哈希的前端资源
├── runtime/bun/           # 固定版本运行时
├── shared/backend.env     # 服务器环境配置，权限 600
└── backups/               # 私有备份
```

公开静态目录需要 Nginx 可读、可遍历；runtime、shared、backups 为私有目录。
服务使用普通部署账号，后端监听 `127.0.0.1:3000`，MySQL 使用本机 3306。
Nginx 保留 `/api` 前缀，浏览器使用 hash 路由；公网提供 `/health`，`/docs` 在服务器本机检查。
用户名、域名和部署根目录须同时用于初始化与模板替换，保持各配置一致。

## 首次准备

先确定已有的普通 Linux 部署账号和解析到服务器的域名。以下均为示例，执行前修改。
Linux 命令在同一个 Bash 终端执行；重新登录后先重新设置这些变量。

```bash
APP_USER=deploy
APP_DOMAIN=example.com
APP_ROOT=/srv/swms
BUN_VERSION=1.3.14
bash deploy/prepare-server.sh --user "$APP_USER" --domain "$APP_DOMAIN" --root "$APP_ROOT" --check
sudo bash deploy/prepare-server.sh --user "$APP_USER" --domain "$APP_DOMAIN" --root "$APP_ROOT"
```

脚本支持 `--help`，`--user` 和 `--domain` 必填，`--root` 默认 `/srv/swms`。
`--check` 只检查参数和账号，不安装软件、不生成配置；账号应事先创建。
目录限 `/srv` 或 `/opt` 下的独立路径，不含空格、`..` 或符号链接，匹配服务的 ProtectHome 设置。

首次脚本安装 MySQL 和工具，创建固定的 `swms` 库及 `swms_app` 应用账号，生成随机数据库密码、
JWT 密钥及初始化密码，写入服务器私有环境文件。已有配置、同名库或账号会停止，不自动覆盖。
MySQL 初始缓冲池 128 MiB、连接上限 20，按实际容量调整；脚本用于首次初始化，不用于更新。
管理员先审阅脚本对 MySQL 服务的配置和重启步骤，再执行。

部署账号安装与本地验证一致的 Bun 版本：

```bash
curl -fsSL https://bun.sh/install -o "$APP_ROOT/runtime/install-bun.sh"
BUN_INSTALL="$APP_ROOT/runtime/bun" bash "$APP_ROOT/runtime/install-bun.sh" "bun-v$BUN_VERSION"
"$APP_ROOT/runtime/bun/bin/bun" --version
```

版本升级后先重跑检查和集成测试。官方安装说明：<https://bun.sh/docs/installation>。

## 本机验证与打包

两端分别执行 `bun run check`，前端以 `VITE_USE_MOCK=false`、`VITE_API_BASE_URL=/api` 执行
`bun run build`。前端变量在构建时生效。数据库变更在本地生成并验证迁移，随代码发布。
记录发布提交号；未提交的工作区快照需另外标注并记录包校验值。

仓库根目录的 PowerShell 示例：

```powershell
$releaseId = 'release-001' # 每次使用新编号
$releaseArchive = Join-Path $env:TEMP "swms-$releaseId.tar.gz"
tar --exclude=deploy/generated -czf $releaseArchive backend/src backend/drizzle backend/bun.lock backend/package.json backend/tsconfig.json backend/drizzle.config.ts backend/.env.example frontend/dist deploy
Get-FileHash $releaseArchive -Algorithm SHA256
```

包内仅包含指定源码、迁移、锁文件、示例、前端 dist 和通用部署文件。
生成配置目录需显式排除：Git 忽略规则不会自动作用于 tar。
环境文件、密钥、证书、数据库、`.docs`、`.git` 和 Windows node_modules 不随包上传。

## 发布目录与配置生成

将发布包上传到部署账号自己的准备目录，核对 `sha256sum` 后，在 Bash 中执行：

```bash
set -euo pipefail
release_id=release-001
release_dir="$APP_ROOT/releases/$release_id"
test ! -e "$release_dir"
mkdir "$release_dir"
tar -xzf "$HOME/swms-bootstrap/swms-$release_id.tar.gz" -C "$release_dir"
ln -s "$APP_ROOT/shared/backend.env" "$release_dir/backend/.env"
cd "$release_dir/backend"
NODE_ENV=development "$APP_ROOT/runtime/bun/bin/bun" install --frozen-lockfile
cp -a --update=none "$release_dir/frontend/dist/assets/." "$APP_ROOT/assets/"
find "$release_dir/frontend/dist" "$APP_ROOT/assets" -type d -exec chmod 0755 {} +
find "$release_dir/frontend/dist" "$APP_ROOT/assets" -type f -exec chmod 0644 {} +
```

安装时保留迁移工具所在的开发依赖。准备失败时停止，不切换 current。
进入发布目录，用与首次准备一致的参数检查和生成配置。Python 3 按明确标记替换，不处理 Nginx 的 `$host` 等变量：

```bash
cd "$release_dir"
bash deploy/prepare-server.sh --user "$APP_USER" --domain "$APP_DOMAIN" --root "$APP_ROOT" --check
APP_GROUP=$(id -gn "$APP_USER")
umask 077
python3 - "$APP_USER" "$APP_GROUP" "$APP_DOMAIN" "$APP_ROOT" <<'PY'
from pathlib import Path
import sys

values = dict(zip(
    ('__APP_USER__', '__APP_GROUP__', '__APP_DOMAIN__', '__APP_ROOT__'),
    sys.argv[1:],
))
output = Path('deploy/generated')
output.mkdir(mode=0o700, exist_ok=True)
for source, target in (
    ('deploy/nginx/swms.conf.template', 'swms.conf'),
    ('deploy/systemd/swms-api.service.template', 'swms-api.service'),
):
    content = Path(source).read_text(encoding='utf-8')
    for marker, value in values.items():
        content = content.replace(marker, value)
    assert '__APP_' not in content, '存在未替换标记'
    (output / target).write_text(content, encoding='utf-8', newline='\n')
PY
```

实际配置保存在 `deploy/generated/`，不纳入 Git 或下次发布包。模板文件需先生成，不能直接安装。
服务器现有配置保持原位；日常发布不以新生成的 HTTP 配置覆盖 Certbot 已配置的 HTTPS 站点。

## 首次迁移与启用

在新版本 `backend` 执行 `bun run db:migrate`（使用上文的 Bun 完整路径）。
如需虚构数据，再显式执行 `db:seed:projects`；仅管理员可用 `db:seed` 和 `db:seed:business-permissions`。
密码仅由部署者在自己的终端查看共享配置。初始化成功后设置首次 current：

```bash
test ! -e "$APP_ROOT/current"
ln -s "$release_dir" "$APP_ROOT/current"
sudo install -m 0644 "$release_dir/deploy/generated/swms-api.service" /etc/systemd/system/swms-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now swms-api
curl --retry 10 --retry-connrefused --retry-delay 1 --fail http://127.0.0.1:3000/health
curl --fail --output /dev/null http://127.0.0.1:3000/docs

test ! -e /etc/nginx/sites-available/swms
test ! -e /etc/nginx/sites-enabled/swms
sudo install -m 0644 "$release_dir/deploy/generated/swms.conf" /etc/nginx/sites-available/swms
sudo ln -s /etc/nginx/sites-available/swms /etc/nginx/sites-enabled/swms
sudo nginx -t
sudo systemctl reload nginx
curl --retry 5 --retry-all-errors --retry-delay 1 --fail -H "Host: $APP_DOMAIN" http://127.0.0.1/health
sudo certbot --nginx -d "$APP_DOMAIN" --redirect
sudo certbot renew --dry-run
```

Nginx、Certbot（含 nginx 插件）、Python 3 需已安装。证书邮箱及条款由管理员在终端确认。
中途失败时先核对停点，不重复首次脚本；Nginx 检查失败时不 reload。既有站点使用各自配置。
参考：[Nginx 代理](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)、
[systemd 服务](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)。

## 日常更新与备份

1. 本地检查、验收、提交和推送，记录版本；构建、上传并验证发布包。
2. 准备新版本依赖与静态资源，记录 `readlink -f "$APP_ROOT/current"`。
3. 涉及后端或数据库时，创建 `$APP_ROOT/maintenance` 并停止 swms-api，管理员备份数据库及共享环境配置。
4. 在新版本执行正式迁移；失败则保持维护状态，核对库状态后处理。
5. 建立 current.next 指向新目录，通过 `mv -Tf` 原子切换 current，再启动服务并检查健康。
6. 验证通过后移除维护标记，验收 HTTPS、登录、权限、月报审批与 Excel，记录结果。

管理员的数据库备份示例（变量作为参数显式传给 sudo 后的 Bash）：

```bash
sudo bash -s -- "$APP_ROOT" "$APP_USER" "$APP_GROUP" <<'SH'
set -euo pipefail
umask 077
backup_dir="$1/backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir "$backup_dir"
mysqldump --single-transaction --routines --triggers --events --set-gtid-purged=OFF --no-tablespaces swms | gzip > "$backup_dir/swms.sql.gz"
gzip -t "$backup_dir/swms.sql.gz"
cp "$1/shared/backend.env" "$backup_dir/backend.env"
readlink -f "$1/current" > "$backup_dir/release.txt"
sha256sum "$backup_dir/swms.sql.gz" > "$backup_dir/SHA256SUMS"
chown -R "$2:$3" "$backup_dir"
SH
```

切换命令在部署账号执行，事先核对 current.next 不存在：

```bash
test ! -e "$APP_ROOT/current.next"
ln -s "$release_dir" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
sudo systemctl start swms-api
curl --retry 10 --retry-connrefused --retry-delay 1 --fail http://127.0.0.1:3000/health
rm "$APP_ROOT/maintenance"
```

仅前端更新可保留原后端运行版本，备份旧前端及当前链接后切换；若新目录链接复用旧后端，须保留其被引用目录。
日常代码更新不覆盖 Nginx HTTPS 配置，不重复 seed、生成迁移或运行 `db:push`。
服务文件变动时另行审阅、安装并 daemon-reload；环境变量变化后再重启。

## 回退与验收

数据库兼容时，在维护状态切回记录的旧目录并重启。需要恢复数据库时由管理员停服务，
备份失败现场、校验原备份，再导入并恢复匹配版本；需另行处理备份时点之后的数据。
保留至少上一版代码、旧哈希资源和数据库备份。

```bash
sudo journalctl -u swms-api -n 100 --no-pager
curl --fail "https://$APP_DOMAIN/health"
ss -ltn
free -h
```

验收包含登录注册、审核列表即时更新、各数据范围、项目月报与主管审批、真实 Excel 下载。
文件上传实现后，文件目录放入 shared，并扩展备份恢复和上传限制。
