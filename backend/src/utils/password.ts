/** 使用 Argon2id 生成带盐密码哈希，数据库不保存明文密码。 */
export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "argon2id" })
}
/** 使用已保存的哈希验证输入密码，算法及盐信息由哈希内容提供。 */
export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash)
}
