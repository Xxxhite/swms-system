#!/usr/bin/env bash
# 管理员首次准备：安装依赖、创建独立目录与数据库，生成仅保存在服务器的凭据。
set -euo pipefail
umask 077

app_user=
app_domain=
app_root=/srv/swms
check_only=false

# 参数只接收明确的账号、域名与目录，不从用户提供的文件执行 shell 内容。
usage() {
    echo '用法：bash deploy/prepare-server.sh --user <已有账号> --domain <域名> [--root /srv/swms] [--check]'
    echo '--check 仅检查参数和账号，无需管理员权限，不安装软件或生成配置。'
}
while [[ $# -gt 0 ]]; do
    case "$1" in
        --user|--domain|--root)
            if [[ $# -lt 2 || -z "$2" || "$2" == --* ]]; then
                echo "缺少参数值：$1" >&2
                exit 2
            fi
            case "$1" in
                --user) app_user=$2 ;;
                --domain) app_domain=$2 ;;
                --root) app_root=$2 ;;
            esac
            shift 2
            ;;
        --check) check_only=true; shift ;;
        --help|-h) usage; exit 0 ;;
        *) echo "未知参数：$1" >&2; usage >&2; exit 2 ;;
    esac
done
if [[ ! "$app_user" =~ ^[a-zA-Z_][a-zA-Z0-9_-]{0,31}$ ]]; then
    echo '请通过 --user 指定有效的已有 Linux 部署账号。' >&2
    exit 2
fi
# 仅接受常规 DNS 域名；拒绝换行、路径和 shell／配置分隔字符。
if [[ ! "$app_domain" =~ ^[a-z0-9.-]+$ || ${#app_domain} -gt 253 || "$app_domain" != *.* || "$app_domain" == *. ]]; then
    echo '请通过 --domain 指定有效域名。' >&2
    exit 2
fi
IFS='.' read -r -a domain_labels <<< "$app_domain"
for label in "${domain_labels[@]}"; do
    if [[ ! "$label" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
        echo '域名须使用小写 DNS 标签，且标签不能以连字符开头或结尾。' >&2
        exit 2
    fi
done
# systemd 模板启用 ProtectHome，只支持 /srv 或 /opt 下不含空格的独立目录。
if [[ ! "$app_root" =~ ^/(srv|opt)/[a-zA-Z0-9_-]+(/[a-zA-Z0-9_-]+)*$ ]]; then
    echo '部署目录须为 /srv 或 /opt 下的独立绝对路径，不能包含空格或 ..。' >&2
    exit 2
fi
if [[ "$(readlink -m "$app_root")" != "$app_root" ]]; then
    echo '部署目录或其父目录不能为符号链接。' >&2
    exit 2
fi
id "$app_user" >/dev/null
app_group=$(id -gn "$app_user")
if $check_only; then
    printf '参数检查通过：账号=%s，域名=%s，目录=%s\n' "$app_user" "$app_domain" "$app_root"
    exit 0
fi
if [[ ${EUID} -ne 0 ]]; then
    echo '首次准备需以 sudo bash 执行；仅检查参数请增加 --check。' >&2
    exit 1
fi
if [[ -e "$app_root/shared/backend.env" ]]; then
    echo '服务器配置已存在，停止首次初始化；后续请使用更新流程。' >&2
    exit 1
fi
if [[ -e /etc/mysql/mysql.conf.d/swms.cnf ]]; then
    echo 'MySQL 的 swms 配置已存在，请先核对初始化停点。' >&2
    exit 1
fi

apt-get update
apt-get install -y mysql-server unzip curl ca-certificates openssl
install -d -m 0755 -o "$app_user" -g "$app_group" "$app_root" \
    "$app_root/releases" "$app_root/assets"
install -d -m 0700 -o "$app_user" -g "$app_group" \
    "$app_root/shared" "$app_root/backups" "$app_root/runtime"

# 新增 MySQL 初始限制连接数和缓冲池，后续按主机资源监测结果调整。
cat > /etc/mysql/mysql.conf.d/swms.cnf <<'EOF'
[mysqld]
bind-address=127.0.0.1
mysqlx-bind-address=127.0.0.1
skip-name-resolve=ON
innodb-buffer-pool-size=128M
max-connections=20
performance-schema=OFF
EOF
chmod 0644 /etc/mysql/mysql.conf.d/swms.cnf
systemctl restart mysql
systemctl enable mysql

existing=$(mysql --batch --skip-column-names -e \
    "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='swms'")
if [[ "$existing" != 0 ]]; then
    echo '数据库 swms 已存在，停止以保留数据；请人工核对。' >&2
    exit 1
fi
existing_user=$(mysql --batch --skip-column-names -e \
    "SELECT COUNT(*) FROM mysql.user WHERE User='swms_app'")
if [[ "$existing_user" != 0 ]]; then
    echo '数据库账号 swms_app 已存在，请人工核对，未修改其密码。' >&2
    exit 1
fi

# 十六进制随机值可直接用于此处 SQL 和 dotenv，不把凭据写入命令参数或终端。
db_password=$(openssl rand -hex 24)
jwt_secret=$(openssl rand -hex 32)
admin_password=$(openssl rand -hex 16)
demo_password=$(openssl rand -hex 16)
mysql <<SQL
CREATE DATABASE swms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'swms_app'@'127.0.0.1' IDENTIFIED BY '${db_password}';
GRANT ALL PRIVILEGES ON swms.* TO 'swms_app'@'127.0.0.1';
SQL

cat > "$app_root/shared/backend.env" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=swms
DB_USER=swms_app
DB_PASSWORD=${db_password}
JWT_SECRET=${jwt_secret}
JWT_EXPIRES_SECONDS=28800
CORS_ORIGIN=https://${app_domain}
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=${admin_password}
SEED_DEMO_PASSWORD=${demo_password}
TEST_DB_NAME=
TEST_DB_RESET=0
EOF
chmod 0600 "$app_root/shared/backend.env"
chown "$app_user:$app_group" "$app_root/shared/backend.env"
printf '首次准备完成。凭据仅在 %s/shared/backend.env，请在自己的终端查看登录密码。\n' "$app_root"
printf '下一步由 %s 安装固定版本 Bun、上传发布包并初始化业务。\n' "$app_user"
