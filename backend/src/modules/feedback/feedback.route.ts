import { Elysia } from "elysia"
import { createAuthentication } from "@/plugins/auth"
import { identityService, type IdentityService } from "@/modules/identity/identity.service"
import { idParam } from "@/modules/project/project.validation"
import { ok } from "@/utils/response"
import { feedbackRepository, type FeedbackRepository } from "./feedback.repository"
import { FeedbackService } from "./feedback.service"
import { feedbackBody, feedbackVoidBody } from "./feedback.validation"
export function createFeedbackRoutes(
  repository: FeedbackRepository = feedbackRepository,
  identities: IdentityService = identityService,
) {
  const service = new FeedbackService(repository)
  return new Elysia({ prefix: "/service/tasks", tags: ["质量反馈"] })
    .use(createAuthentication(identities))
    .get(
      "/:id/feedback",
      async ({ authenticate, params }) => ok(await service.detail(await authenticate(), params.id)),
      { params: idParam },
    )
    .put(
      "/:id/feedback",
      async ({ authenticate, params, body }) =>
        ok(await service.save(await authenticate(), params.id, body)),
      { params: idParam, body: feedbackBody },
    )
    .post(
      "/:id/feedback/void",
      async ({ authenticate, params, body }) =>
        ok(await service.save(await authenticate(), params.id, body, true)),
      { params: idParam, body: feedbackVoidBody },
    )
}
