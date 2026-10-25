import { Elysia, t } from "elysia"
import { createAuthentication } from "@/plugins/auth"
import { identityService, type IdentityService } from "@/modules/identity/identity.service"
import { projectRepository, type ProjectRepository } from "@/modules/project/project.repository"
import { env } from "@/utils/env"
import { ok } from "@/utils/response"
import { FileService } from "./file.service"
/** 上传和下载均经过实际项目权限校验，不开放静态文件目录。 */
export function createFileRoutes(
  repository: ProjectRepository = projectRepository,
  identities: IdentityService = identityService,
  directory?: string,
) {
  const service = new FileService(repository, directory)
  const params = t.Object({ id: t.Numeric({ minimum: 1, multipleOf: 1 }) })
  return new Elysia({ tags: ["服务管理"] })
    .use(createAuthentication(identities))
    .get(
      "/service/contract-package-projects/:id/contract/files",
      async ({ authenticate, params }) => ok(await service.list(await authenticate(), params.id)),
      { params },
    )
    .post(
      "/service/contract-package-projects/:id/contract/files",
      async ({ authenticate, params, body }) =>
        ok(await service.upload(await authenticate(), params.id, body.file)),
      { params, body: t.Object({ file: t.File({ maxSize: env.uploadMaxBytes }) }) },
    )
    .get(
      "/files/:id/download",
      async ({ authenticate, params }) => service.download(await authenticate(), params.id),
      { params },
    )
    .delete(
      "/files/:id",
      async ({ authenticate, params }) => ok(await service.remove(await authenticate(), params.id)),
      { params },
    )
}
