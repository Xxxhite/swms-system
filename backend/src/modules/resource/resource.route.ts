import { Elysia, t } from "elysia"
import { createAuthentication } from "@/plugins/auth"
import { identityService, type IdentityService } from "@/modules/identity/identity.service"
import { ok } from "@/utils/response"
import { AppError } from "@/utils/errors"
import { idParam, versionBody, shortText } from "@/modules/project/project.validation"
import { ResourceService } from "./resource.service"
import { resourceRepository, type ResourceRepository } from "./resource.repository"
import {
  resourceBody,
  resourceQuery,
  contactBody,
  cooperationBody,
  followupBody,
  mergeBody,
} from "./resource.validation"
export function createResourceRoutes(
  repository: ResourceRepository = resourceRepository,
  identities: IdentityService = identityService,
) {
  const service = new ResourceService(repository)
  return new Elysia({ prefix: "/resources", tags: ["资源管理"] })
    .use(createAuthentication(identities))
    .get(
      "",
      async ({ authenticate, query }) => ok(await service.list(await authenticate(), query)),
      { query: resourceQuery },
    )
    .post(
      "",
      async ({ authenticate, body }) => ok(await service.create(await authenticate(), body)),
      { body: resourceBody },
    )
    .get("/candidates", async ({ authenticate }) =>
      ok(await service.candidates(await authenticate())),
    )
    .get("/legacy-contracts", async ({ authenticate }) =>
      ok(await service.legacy(await authenticate())),
    )
    .post(
      "/legacy-contracts/:id/link",
      async ({ authenticate, params, body }) =>
        ok(
          await service.linkLegacy(await authenticate(), params.id, body.resourceId, body.version),
        ),
      {
        params: idParam,
        body: t.Object({ resourceId: t.Integer({ minimum: 1 }), ...versionBody.properties }),
      },
    )
    .post(
      "/merge-preview",
      async ({ authenticate, body }) => ok(await service.merge(await authenticate(), body, true)),
      { body: mergeBody },
    )
    .post(
      "/merge",
      async ({ authenticate, body }) => ok(await service.merge(await authenticate(), body)),
      { body: mergeBody },
    )
    .get(
      "/:id",
      async ({ authenticate, params }) => ok(await service.detail(await authenticate(), params.id)),
      { params: idParam },
    )
    .put(
      "/:id",
      async ({ authenticate, params, body }) => {
        const { version, ...input } = body
        return ok(await service.update(await authenticate(), params.id, input, version))
      },
      {
        params: idParam,
        body: t.Object({ ...resourceBody.properties, ...versionBody.properties }),
      },
    )
    .post(
      "/:id/archive",
      async ({ authenticate, params, body }) =>
        ok(await service.archive(await authenticate(), params.id, body.version, body.reason)),
      {
        params: idParam,
        body: t.Object({ ...versionBody.properties, reason: shortText(1000, "归档原因") }),
      },
    )
    .get(
      "/:id/contacts",
      async ({ authenticate, params }) => {
        const d = await service.detail(await authenticate(), params.id)
        if (!d.canViewContacts) throw AppError.forbidden()
        return ok(d.contacts)
      },
      { params: idParam },
    )
    .post(
      "/:id/contacts",
      async ({ authenticate, params, body }) =>
        ok(await service.contact(await authenticate(), params.id, body)),
      { params: idParam, body: contactBody },
    )
    .put(
      "/:id/contacts/:childId",
      async ({ authenticate, params, body }) => {
        const { version, ...input } = body
        return ok(
          await service.contact(await authenticate(), params.id, input, params.childId, version),
        )
      },
      {
        params: t.Object({
          ...idParam.properties,
          childId: t.Numeric({ minimum: 1, multipleOf: 1 }),
        }),
        body: t.Object({ ...contactBody.properties, ...versionBody.properties }),
      },
    )
    .get(
      "/:id/cooperations",
      async ({ authenticate, params }) => {
        const d = await service.detail(await authenticate(), params.id)
        return ok(d.cooperations)
      },
      { params: idParam },
    )
    .post(
      "/:id/cooperations",
      async ({ authenticate, params, body }) =>
        ok(await service.cooperation(await authenticate(), params.id, body)),
      { params: idParam, body: cooperationBody },
    )
    .put(
      "/:id/cooperations/:childId",
      async ({ authenticate, params, body }) => {
        const { version, ...input } = body
        return ok(
          await service.cooperation(
            await authenticate(),
            params.id,
            input,
            params.childId,
            version,
          ),
        )
      },
      {
        params: t.Object({
          ...idParam.properties,
          childId: t.Numeric({ minimum: 1, multipleOf: 1 }),
        }),
        body: t.Object({ ...cooperationBody.properties, ...versionBody.properties }),
      },
    )
    .get(
      "/:id/followups",
      async ({ authenticate, params }) => {
        const d = await service.detail(await authenticate(), params.id)
        return ok(d.followups)
      },
      { params: idParam },
    )
    .post(
      "/:id/followups",
      async ({ authenticate, params, body }) =>
        ok(await service.followup(await authenticate(), params.id, body)),
      { params: idParam, body: followupBody },
    )
    .put(
      "/:id/followups/:childId",
      async ({ authenticate, params, body }) => {
        const { version, ...input } = body
        return ok(
          await service.followup(await authenticate(), params.id, input, params.childId, version),
        )
      },
      {
        params: t.Object({
          ...idParam.properties,
          childId: t.Numeric({ minimum: 1, multipleOf: 1 }),
        }),
        body: t.Object({ ...followupBody.properties, ...versionBody.properties }),
      },
    )
    .get(
      "/:id/contracts",
      async ({ authenticate, params }) =>
        ok((await service.detail(await authenticate(), params.id)).contracts),
      { params: idParam },
    )
}
