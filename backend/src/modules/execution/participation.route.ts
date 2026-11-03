import { Elysia } from "elysia"
import { projectRepository, type ProjectRepository } from "@/modules/project/project.repository"
import { ok } from "@/utils/response"
import { CredentialService } from "./credential.service"
import { tokenBody, publicConfirmBody } from "./execution.validation"
export function createParticipationRoutes(
  repository: ProjectRepository = projectRepository,
  now: () => Date = () => new Date(),
) {
  const service = new CredentialService(repository, now)
  return new Elysia({ prefix: "/execution/participation", tags: ["参与确认"] })
    .onRequest(({ set }) => {
      set.headers["cache-control"] = "no-store"
      set.headers["referrer-policy"] = "no-referrer"
    })
    .post("/resolve", async ({ body }) => ok(await service.resolve(body.token)), {
      body: tokenBody,
    })
    .post("/confirm", async ({ body }) => ok(await service.confirm(body)), {
      body: publicConfirmBody,
    })
}
