#!/usr/bin/env bash
# 管理员首次准备：安装依赖、创建独立目录与数据库，生成仅保存在服务器的凭据。
set -euo pipefail
umask 077

if [[ ${EUID} -ne 0 ]]; then
    echo '请通过 sudo bash prepare-server.sh 执行。' >&2
    exit 1
fi
app_user=Xxxhite
app_root=/srv/swms
id "$app_user" >/dev/null
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
install -d -m 0755 -o "$app_user" -g "$app_user" "$app_root" \
    "$app_root/releases" "$app_root/assets"
install -d -m 0700 -o "$app_user" -g "$app_user" \
    "$app_root/shared" "$app_root/backups" "$app_root/runtime"

# 此主机已有其他服务；新增 MySQL 初始限制连接数和缓冲池，后续按监测结果调整。
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
CORS_ORIGIN=https://swms.sopak.space
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=${admin_password}
SEED_DEMO_PASSWORD=${demo_password}
TEST_DB_NAME=
TEST_DB_RESET=0
EOF
chmod 0600 "$app_root/shared/backend.env"
chown "$app_user:$app_user" "$app_root/shared/backend.env"
echo '首次准备完成。凭据仅在 /srv/swms/shared/backend.env，请在自己的终端查看登录密码。'
echo '下一步由 Xxxhite 安装固定版本 Bun、上传发布包并初始化业务。'
