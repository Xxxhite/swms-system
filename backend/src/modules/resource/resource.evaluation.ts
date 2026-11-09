import { t, type Static } from "elysia"
import type { Actor } from "@/utils/authorization"
import { assertVersion } from "@/utils/authorization"
import { AppError } from "@/utils/errors"
import { fingerprint } from "@/modules/task/task-calendar"
import { feedbackRequest } from "@/modules/feedback/feedback.validation"
import { FeedbackRepository } from "@/modules/feedback/feedback.repository"
import { replay, qualityHistory } from "@/modules/feedback/feedback.history"
import { evaluationReadable, evaluationOwner } from "./resource.evaluation.authorization"
export const evaluationBody = t.Object({
  ...feedbackRequest,
  feedbackRating: t.Union([
    t.Literal("SATISFIED"),
    t.Literal("GENERAL"),
    t.Literal("NEEDS_IMPROVEMENT"),
  ]),
  result: t.String({ maxLength: 2000 }),
  feedback: t.String({ maxLength: 2000 }),
})
export class CooperationEvaluationService {
  constructor(readonly repository = new FeedbackRepository()) {}
  detail(actor: Actor, resourceId: number, id: number) {
    return this.repository.run(actor, false, (data) => {
      const c = data.cooperations.find((c) => c.id === id && c.resourceId === resourceId)
      if (!c || !evaluationReadable(data, data.actor!, c)) throw AppError.notFound()
      return {
        cooperation: {
          id: c.id,
          title: c.title,
          result: c.result,
          feedback: c.feedback,
          feedbackRating: c.feedbackRating,
          feedbackBy: c.feedbackBy,
          feedbackAt: c.feedbackAt,
          version: c.version,
        },
        canEdit: evaluationOwner(data, data.actor!, c),
        history: qualityHistory(data, "cooperation_evaluation", id),
      }
    })
  }
  save(actor: Actor, resourceId: number, id: number, input: Static<typeof evaluationBody>) {
    return this.repository.run(actor, true, async (data, tx) => {
      const current = data.actor!,
        c = data.cooperations.find((c) => c.id === id && c.resourceId === resourceId)
      if (!c || !evaluationReadable(data, current, c)) throw AppError.notFound()
      if (!evaluationOwner(data, current, c))
        throw AppError.forbidden("仅有效合作的实际负责人或资源维护人可评价")
      const prior = replay(data, "cooperation_evaluation", id, current.user.id, input)
      if (prior) return prior
      assertVersion(c.version, input.version)
      if (c.feedbackRating && !input.reason?.trim()) throw AppError.badRequest("更正评价请填写原因")
      if (input.feedbackRating === "NEEDS_IMPROVEMENT" && !input.feedback.trim())
        throw AppError.badRequest("请填写待改进的主要问题")
      const values = {
        feedbackRating: input.feedbackRating,
        result: input.result,
        feedback: input.feedback,
        feedbackBy: current.user.id,
        feedbackAt: new Date(),
        version: c.version + 1,
      }
      await tx.resources.cooperations.update(id, values)
      const result = { id, version: values.version }
      await tx.audit({
        actorId: current.user.id,
        action: "evaluate-cooperation",
        entityType: "cooperation_evaluation",
        entityId: id,
        beforeData: { feedbackRating: c.feedbackRating, result: c.result, feedback: c.feedback },
        afterData: {
          value: values,
          reason: input.reason ?? "",
          requestKey: input.requestKey,
          hash: fingerprint(input),
          result,
        },
      })
      return result
    })
  }
}
