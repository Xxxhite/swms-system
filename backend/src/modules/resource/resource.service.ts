import {
  regionAddress,
  regionDisplay,
  regionMatches,
  validateRegionQuery,
} from "@/modules/region/region.shared"
import { dictionaries } from "@/modules/identity/identity.constants"
import * as s from "@/db/schema"
import { requirePermission, assertVersion, type Actor } from "@/utils/authorization"
import { canMaintainProject, isManagement } from "@/utils/business-scope"
import { AppError } from "@/utils/errors"
import { businessToday } from "@/modules/service/indicator-calculation"
import { sortRows } from "@/utils/list-sort"
import { pageResult } from "@/modules/project/project.validation"
import {
  ResourceRepository,
  resourceRepository,
  type ResourceConnection,
} from "./resource.repository"
import type {
  ResourceInput,
  ResourceQuery,
  ContactInput,
  CooperationInput,
  FollowupInput,
  MergeInput,
} from "./resource.validation"
import type { IdentityState } from "@/modules/identity/identity.repository"
export type Resource = typeof s.resources.$inferSelect
export function canReadResource(actor: Actor, r: Pick<Resource, "maintainerId" | "ownerOrgId">) {
  return (
    actor.profile.dataScope === "ALL" ||
    (actor.profile.dataScope === "SELF"
      ? r.maintainerId === actor.user.id
      : actor.orgIds.includes(r.ownerOrgId))
  )
}
export function relationship(
  rows: Array<
    Pick<typeof s.resourceCooperations.$inferSelect, "status" | "startDate" | "endDate"> & {
      wasEffective?: number
    }
  >,
  today = businessToday(),
) {
  if (
    rows.some(
      (r) =>
        r.status === "AGREED" &&
        !!r.startDate &&
        r.startDate <= today &&
        (!r.endDate || r.endDate >= today),
    )
  )
    return "CURRENT"
  if (
    rows.some(
      (r) =>
        r.status === "ENDED" ||
        (r.status === "AGREED" && !!r.endDate && r.endDate < today) ||
        (r.status === "TERMINATED" && !!r.wasEffective),
    )
  )
    return "HISTORICAL"
  return "POTENTIAL"
}
export async function getResource(
  tx: ResourceConnection,
  actor: Actor,
  id: number,
  permission = "resource:view",
  active = false,
) {
  requirePermission(actor, permission)
  const [r] = await tx.resources.find(id)
  if (!r || !canReadResource(actor, r)) throw AppError.notFound("资源不存在或无权访问")
  if (active && r.status !== "ACTIVE") throw AppError.conflict("该资源已归档或合并")
  return r
}
function assignment(actor: Actor, identity: IdentityState, orgId: number, userId: number) {
  const org = identity.orgs.find((o) => o.id === orgId && o.status === "ACTIVE")
  const user = identity.users.find(
    (u) => u.id === userId && u.status === "ACTIVE" && u.orgId === orgId,
  )
  const allowed =
    actor.profile.dataScope === "ALL" ||
    (actor.profile.dataScope === "SELF"
      ? orgId === actor.user.orgId && userId === actor.user.id
      : actor.orgIds.includes(orgId))
  if (!org || !user || !allowed) throw AppError.forbidden("归属组织或维护负责人超出授权范围")
}
function owner(actor: Actor, identity: IdentityState, userId: number) {
  const user = identity.users.find((u) => u.id === userId && u.status === "ACTIVE")
  if (
    !user ||
    (actor.profile.dataScope === "SELF"
      ? userId !== actor.user.id
      : actor.profile.dataScope !== "ALL" && !actor.orgIds.includes(user.orgId ?? 0))
  )
    throw AppError.forbidden("负责人不在授权范围内")
}
function validateFields(input: ResourceInput) {
  if (
    input.serviceFieldCodes?.some(
      (code) => !dictionaries.serviceFields.some((f) => f.code === code),
    ) ||
    new Set(input.serviceFieldCodes).size !== (input.serviceFieldCodes?.length ?? 0)
  )
    throw AppError.badRequest("请选择有效且不重复的服务领域")
}
async function touchResource(tx: ResourceConnection, id: number) {
  const [r] = await tx.resources.find(id)
  if (r) await tx.resources.update(id, { version: r.version + 1 })
}
export async function createResource(
  tx: ResourceConnection,
  actor: Actor,
  identity: IdentityState,
  input: ResourceInput,
) {
  requirePermission(actor, "resource:record:create")
  validateFields(input)
  assignment(actor, identity, input.ownerOrgId, input.maintainerId)
  if (input.requestKey) {
    const old = (await tx.resources.all()).find(
      (r) => r.createdBy === actor.user.id && r.requestKey === input.requestKey,
    )
    if (old) {
      await getResource(tx, actor, old.id)
      return old.id
    }
  }
  const { requestKey, ...values } = input
  const area = regionAddress(await tx.regions.all(), input, undefined, true, true)
  const id = await tx.resources.insert({
    ...values,
    ...area,
    region: area.regionPathSnapshot!.at(-1)!.name,
    name: input.name.trim(),
    normalizedName: input.name.trim().normalize("NFKC").replace(/\s+/g, " ").toLowerCase(),
    creditCode: input.creditCode?.trim().toUpperCase() || null,
    requestKey: requestKey || null,
    createdBy: actor.user.id,
  })
  await tx.audit(actor.user.id, "create-resource", id, { name: input.name })
  return id
}
function projectVisible(
  actor: Actor,
  p: typeof s.projects.$inferSelect,
  teams: Array<typeof s.projectTeams.$inferSelect>,
) {
  return (
    !p.deletedAt &&
    (canMaintainProject(actor, p) ||
      (!isManagement(actor) &&
        teams.some((t) => t.projectId === p.id && t.teamId === actor.profile.teamId)))
  )
}
async function validCooperations(tx: ResourceConnection) {
  const projects = await tx.projects()
  return (await tx.cooperations.all()).filter(
    (c) =>
      c.type !== "CONTRACT" ||
      projects.some((p) => p.id === c.projectId && !p.deletedAt && p.status === "ACTIVE"),
  )
}
export class ResourceService {
  constructor(readonly repository: ResourceRepository = resourceRepository) {}
  list(actor: Actor, q: ResourceQuery) {
    return this.repository.run(actor, false, async (tx, current, identity) => {
      requirePermission(current, "resource:view")
      const cooperations = await validCooperations(tx),
        followups = await tx.followups.all()
      const regions = await tx.regions.all()
      validateRegionQuery(regions, q, q.region)
      const rows = (await tx.visible(current)).map((r) => ({
        ...r,
        maintainerName: identity.users.find((u) => u.id === r.maintainerId)?.name,
        ownerOrgName: identity.orgs.find((o) => o.id === r.ownerOrgId)?.name,
        relationship: relationship(cooperations.filter((c) => c.resourceId === r.id)),
        overdue: followups.filter(
          (f) =>
            f.resourceId === r.id &&
            !f.completed &&
            f.nextDueDate &&
            f.nextDueDate < businessToday(),
        ).length,
      }))
      return pageResult(
        sortRows(
          rows.filter(
            (r) =>
              (!q.keyword || r.name.includes(q.keyword)) &&
              (!q.status || r.status === q.status) &&
              (!q.region || r.region === q.region) &&
              regionMatches(regions, q.regionCode, r) &&
              (!q.regionUnmapped || !r.regionCode) &&
              (!q.unitType || r.unitType === q.unitType) &&
              (!q.capability || r.capabilityCodes.includes(q.capability)) &&
              (!q.maintainerId || r.maintainerId === q.maintainerId) &&
              (!q.relationship || r.relationship === q.relationship) &&
              (q.overdue !== "1" || r.overdue > 0),
          ),
          q,
          {
            id: (r) => r.id,
            name: (r) => r.name,
            createdAt: (r) => r.createdAt,
            updatedAt: (r) => r.updatedAt,
            overdue: (r) => r.overdue,
          },
          [
            ["createdAt", "desc"],
            ["id", "desc"],
          ],
        ),
        q,
      )
    })
  }
  candidates(actor: Actor) {
    return this.repository.run(actor, false, async (tx, current, identity) => {
      requirePermission(current, "resource:view")
      return {
        serviceFields: dictionaries.serviceFields,
        resources: (await tx.visible(current))
          .filter((r) => r.status === "ACTIVE")
          .map((r) => ({ id: r.id, name: r.name, region: regionDisplay(r, r.region) })),
        organizations: identity.orgs
          .filter(
            (o) =>
              o.status === "ACTIVE" &&
              (current.profile.dataScope === "ALL" ||
                (current.profile.dataScope === "SELF"
                  ? o.id === current.user.orgId
                  : current.orgIds.includes(o.id))),
          )
          .map((o) => ({ id: o.id, name: o.name })),
        users: identity.users
          .filter(
            (u) =>
              u.status === "ACTIVE" &&
              (current.profile.dataScope === "ALL" ||
                (current.profile.dataScope === "SELF"
                  ? u.id === current.user.id
                  : current.orgIds.includes(u.orgId ?? 0))),
          )
          .map((u) => ({ id: u.id, name: u.name, orgId: u.orgId })),
      }
    })
  }
  detail(actor: Actor, id: number) {
    return this.repository.run(actor, false, async (tx, current, identity) => {
      const r = await getResource(tx, current, id)
      const cooperations = (await tx.cooperations.all()).filter((c) => c.resourceId === id)
      const projects = await tx.projects(),
        teams = await tx.teams()
      const visible = (projectId: number | null) =>
        projectId === null ||
        projects.some((p) => p.id === projectId && projectVisible(current, p, teams))
      return {
        ...r,
        canViewContacts: current.profile.permissions.includes("resource:contact:view"),
        relationship: relationship(
          (await validCooperations(tx)).filter((c) => c.resourceId === id),
        ),
        contacts: current.profile.permissions.includes("resource:contact:view")
          ? (await tx.contacts.all()).filter((c) => c.resourceId === id)
          : [],
        cooperations: cooperations.filter((c) => visible(c.projectId)).sort((a, b) => b.id - a.id),
        events: (await tx.events(id))
          .sort((a, b) => b.id - a.id)
          .map((e) => ({
            id: e.id,
            action: e.action,
            actorName: identity.users.find((u) => u.id === e.actorId)?.name ?? "历史人员",
            createdAt: e.createdAt,
          })),
        followups: (await tx.followups.all()).filter(
          (f) =>
            f.resourceId === id &&
            (!f.cooperationId ||
              cooperations.some((c) => c.id === f.cooperationId && visible(c.projectId))),
        ),
        contracts: (await tx.contracts())
          .filter((c) => c.resourceId === id && visible(c.projectId))
          .map((c) => ({
            id: c.id,
            projectId: c.projectId,
            contractNo: c.contractNo,
            partnerName: c.partnerName,
            startDate: c.startDate,
            endDate: c.endDate,
            partnerContactSnapshot: current.profile.permissions.includes("resource:contact:view")
              ? c.partnerContactSnapshot
              : null,
            projectName: projects.find((p) => p.id === c.projectId)?.name,
          })),
        merges: (await tx.merges.all()).filter((m) => m.sourceId === id || m.targetId === id),
      }
    })
  }
  create(actor: Actor, input: ResourceInput) {
    return this.repository.run(actor, true, async (tx, current, identity) => ({
      id: await createResource(tx, current, identity, input),
    }))
  }
  update(actor: Actor, id: number, input: ResourceInput, version: number) {
    return this.repository.run(actor, true, async (tx, current, identity) => {
      const r = await getResource(tx, current, id, "resource:record:update", true)
      assertVersion(r.version, version)
      validateFields(input)
      assignment(current, identity, input.ownerOrgId, input.maintainerId)
      const area = regionAddress(
        await tx.regions.all(),
        input,
        r,
        (input.region !== undefined && input.region !== r.region) ||
          (input.address !== undefined && input.address !== r.address),
        true,
      )
      const { requestKey, ...values } = input
      void requestKey
      await tx.resources.update(id, {
        ...values,
        ...area,
        region: area.regionPathSnapshot?.at(-1)?.name ?? r.region,
        name: input.name.trim(),
        normalizedName: input.name.trim().normalize("NFKC").replace(/\s+/g, " ").toLowerCase(),
        creditCode: input.creditCode?.trim().toUpperCase() || null,
        version: version + 1,
      })
      await tx.audit(current.user.id, "update-resource", id, {
        reason: "维护资料",
        name: input.name,
      })
      return { id }
    })
  }
  archive(actor: Actor, id: number, version: number, reason: string) {
    return this.repository.run(actor, true, async (tx, current) => {
      const r = await getResource(tx, current, id, "resource:record:archive", true)
      assertVersion(r.version, version)
      await tx.resources.update(id, { status: "ARCHIVED", version: version + 1 })
      await tx.audit(current.user.id, "archive-resource", id, { reason })
      return { id }
    })
  }
  contact(actor: Actor, id: number, input: ContactInput, childId?: number, version?: number) {
    return this.repository.run(actor, true, async (tx, current) => {
      await getResource(tx, current, id, "resource:contact:manage", true)
      requirePermission(current, "resource:contact:view")
      const rows = (await tx.contacts.all()).filter((c) => c.resourceId === id),
        old = rows.find((c) => c.id === childId)
      if (childId && !old) throw AppError.notFound()
      if (old) assertVersion(old.version, version!)
      const primary = input.isPrimary && input.status === "ACTIVE"
      if (primary)
        for (const c of rows.filter((c) => c.isPrimary && c.id !== childId))
          await tx.contacts.update(c.id, { isPrimary: 0, version: c.version + 1 })
      const values = { ...input, isPrimary: primary ? 1 : 0 }
      const result = old
        ? (await tx.contacts.update(old.id, { ...values, version: old.version + 1 }), old.id)
        : await tx.contacts.insert({ ...values, resourceId: id })
      await touchResource(tx, id)
      await tx.audit(current.user.id, "save-resource-contact", id, {
        contactId: result,
        isPrimary: primary,
        status: input.status,
      })
      return { id: result }
    })
  }
  cooperation(
    actor: Actor,
    id: number,
    input: CooperationInput,
    childId?: number,
    version?: number,
  ) {
    return this.repository.run(actor, true, async (tx, current, identity) => {
      await getResource(tx, current, id, "resource:cooperation:manage", true)
      owner(current, identity, input.ownerId)
      const old = childId ? (await tx.cooperations.find(childId))[0] : undefined
      if (childId && (!old || old.resourceId !== id)) throw AppError.notFound()
      if (old) {
        assertVersion(old.version, version!)
        if (old.type === "CONTRACT") throw AppError.conflict("合同合作请在合同资料中维护")
        if (old.feedbackRating && (input.feedback !== old.feedback || input.result !== old.result))
          throw AppError.conflict("已评价合作请通过合作评价入口更正结果与反馈")
        if (old.status !== input.status && !input.reason?.trim())
          throw AppError.badRequest("变更合作状态请填写原因")
      }
      if (input.startDate && input.endDate && input.endDate < input.startDate)
        throw AppError.badRequest("结束日期不得早于开始日期")
      if (
        ["AGREED", "ENDED"].includes(input.status) &&
        (!input.startDate || !input.endDate || !input.basis?.trim())
      )
        throw AppError.badRequest("达成或结束合作需填写期间和合作依据")
      if (
        input.projectId &&
        !(await tx.projects()).some(
          (p) => p.id === input.projectId && projectVisible(current, p, []),
        )
      )
        throw AppError.forbidden("关联项目不在授权范围")
      if (input.status === "ENDED" && input.endDate! > businessToday())
        throw AppError.badRequest("未来合作不能标记已结束")
      const wasEffective =
        old?.wasEffective ||
        (input.status === "ENDED" ||
        (input.status === "AGREED" && input.startDate! <= businessToday()) ||
        (old?.status === "AGREED" && !!old.startDate && old.startDate <= businessToday())
          ? 1
          : 0)
      const { reason, ...fields } = input
      const values = { ...fields, wasEffective }
      const result = old
        ? (await tx.cooperations.update(old.id, { ...values, version: old.version + 1 }), old.id)
        : await tx.cooperations.insert({ ...values, resourceId: id })
      await touchResource(tx, id)
      await tx.audit(current.user.id, "save-resource-cooperation", id, {
        cooperationId: result,
        status: input.status,
        reason,
      })
      return { id: result }
    })
  }
  followup(actor: Actor, id: number, input: FollowupInput, childId?: number, version?: number) {
    return this.repository.run(actor, true, async (tx, current, identity) => {
      await getResource(tx, current, id, "resource:followup:manage", true)
      const old = childId ? (await tx.followups.find(childId))[0] : undefined
      if (childId && (!old || old.resourceId !== id)) throw AppError.notFound()
      if (old) assertVersion(old.version, version!)
      if (input.contactId) {
        requirePermission(current, "resource:contact:view")
        if (
          !(await tx.contacts.find(input.contactId)).some(
            (c) => c.resourceId === id && c.status === "ACTIVE",
          )
        )
          throw AppError.badRequest("联系人不属于本资源或已归档")
      }
      if (input.cooperationId) {
        const c = (await tx.cooperations.find(input.cooperationId))[0]
        if (!c || c.resourceId !== id) throw AppError.badRequest("合作事项不属于本资源")
        if (
          c.projectId &&
          !(await tx.projects()).some((p) => p.id === c.projectId && projectVisible(current, p, []))
        )
          throw AppError.forbidden()
      }
      if (input.nextAction?.trim() && (!input.nextOwnerId || !input.nextDueDate))
        throw AppError.badRequest("下一步需填写责任人与日期")
      if (input.nextOwnerId) owner(current, identity, input.nextOwnerId)
      const values = {
        ...input,
        occurredAt: new Date(input.occurredAt),
        completed: input.completed ? 1 : 0,
      }
      const result = old
        ? (await tx.followups.update(old.id, { ...values, version: old.version + 1 }), old.id)
        : await tx.followups.insert({ ...values, resourceId: id, createdBy: current.user.id })
      await touchResource(tx, id)
      await tx.audit(current.user.id, "save-resource-followup", id, {
        followupId: result,
        completed: input.completed,
      })
      return { id: result }
    })
  }
  legacy(actor: Actor) {
    return this.repository.run(actor, false, async (tx, current) => {
      requirePermission(current, "project:record:update")
      const projects = (await tx.projects()).filter(
        (p) => !p.deletedAt && canMaintainProject(current, p),
      )
      return (await tx.contracts())
        .filter((c) => !c.resourceId && projects.some((p) => p.id === c.projectId))
        .map((c) => ({
          id: c.id,
          projectId: c.projectId,
          partnerName: c.partnerName,
          projectName: projects.find((p) => p.id === c.projectId)!.name,
          projectVersion: projects.find((p) => p.id === c.projectId)!.version,
        }))
    })
  }
  linkLegacy(actor: Actor, contractId: number, resourceId: number, version: number) {
    return this.repository.run(actor, true, async (tx, current) => {
      requirePermission(current, "project:record:update")
      await getResource(tx, current, resourceId, "resource:view", true)
      const c = (await tx.contracts()).find((c) => c.id === contractId)
      const p = (await tx.projects()).find((p) => p.id === c?.projectId && !p.deletedAt)
      if (!c || !p || !canMaintainProject(current, p)) throw AppError.notFound()
      assertVersion(p.version, version)
      if (c.resourceId) throw AppError.conflict("合同已关联，请刷新")
      await tx.updateContract(c.id, { resourceId, version: c.version + 1 })
      await tx.updateProject(p.id, p.version)
      await syncContractCooperation(tx, current, { ...c, resourceId })
      await tx.audit(current.user.id, "link-resource-contract", resourceId, {
        contractId,
        partnerName: c.partnerName,
      })
      return { id: contractId }
    })
  }
  merge(actor: Actor, input: MergeInput, preview = false) {
    return this.repository.run(actor, !preview, async (tx, current) => {
      requirePermission(current, "resource:record:merge")
      const a = await getResource(tx, current, input.sourceId, "resource:record:update", true),
        b = await getResource(tx, current, input.targetId, "resource:record:update", true)
      if (a.id === b.id) throw AppError.badRequest("请选择不同资源")
      assertVersion(a.version, input.sourceVersion)
      assertVersion(b.version, input.targetVersion)
      if (a.ownerOrgId !== b.ownerOrgId && current.profile.dataScope !== "ALL")
        throw AppError.forbidden("跨组织合并需要全范围授权")
      const contacts = (await tx.contacts.all()).filter((c) => c.resourceId === a.id),
        coops = (await tx.cooperations.all()).filter((c) => c.resourceId === a.id),
        followups = (await tx.followups.all()).filter((c) => c.resourceId === a.id),
        contracts = (await tx.contracts()).filter((c) => c.resourceId === a.id)
      const summary = {
        contacts: contacts.length,
        cooperations: coops.length,
        followups: followups.length,
        contracts: contracts.length,
      }
      if (preview) return { ...summary, source: a.name, target: b.name }
      const hasPrimary = (await tx.contacts.all()).some(
        (c) => c.resourceId === b.id && c.isPrimary && c.status === "ACTIVE",
      )
      for (const c of contacts)
        await tx.contacts.update(c.id, {
          resourceId: b.id,
          isPrimary: hasPrimary ? 0 : c.isPrimary,
          version: c.version + 1,
        })
      for (const c of coops)
        await tx.cooperations.update(c.id, { resourceId: b.id, version: c.version + 1 })
      for (const c of followups)
        await tx.followups.update(c.id, { resourceId: b.id, version: c.version + 1 })
      for (const c of contracts) {
        await tx.updateContract(c.id, { resourceId: b.id, version: c.version + 1 })
        const p = (await tx.projects()).find((p) => p.id === c.projectId)
        if (p) await tx.updateProject(p.id, p.version)
      }
      await tx.resources.update(a.id, {
        status: "MERGED",
        mergedIntoId: b.id,
        version: a.version + 1,
      })
      await tx.resources.update(b.id, { version: b.version + 1 })
      await tx.merges.insert({
        sourceId: a.id,
        targetId: b.id,
        reason: input.reason,
        actorId: current.user.id,
        summary,
      })
      await tx.audit(current.user.id, "merge-resource", b.id, {
        sourceId: a.id,
        reason: input.reason,
        summary,
      })
      return summary
    })
  }
}
export async function contractResource(
  tx: ResourceConnection,
  actor: Actor,
  identity: IdentityState,
  input: {
    resourceId?: number | null
    quickResource?: ResourceInput
    contactId?: number | null
    partnerName: string
    snapshotReason?: string
  },
  old?: typeof s.projectContracts.$inferSelect,
) {
  if (input.resourceId && input.quickResource)
    throw AppError.badRequest("选择资源与快捷建档只能使用一种")
  const resourceId = input.quickResource
    ? await createResource(tx, actor, identity, input.quickResource)
    : (input.resourceId ?? old?.resourceId)
  if (!resourceId) {
    if (!old || old.partnerName !== input.partnerName)
      throw AppError.badRequest("新合同或变更合同方请先关联单位资源")
    return {
      resourceId: null,
      partnerName: old.partnerName,
      partnerContactSnapshot: old.partnerContactSnapshot,
    }
  }
  const changed = !old || old.resourceId !== resourceId
  const refresh = changed || input.contactId !== undefined || input.partnerName !== old?.partnerName
  if (!refresh)
    return {
      resourceId,
      partnerName: old!.partnerName,
      partnerContactSnapshot: old!.partnerContactSnapshot,
    }
  const r = await getResource(tx, actor, resourceId, "resource:view", true)
  if (old && old.resourceId && !input.snapshotReason?.trim())
    throw AppError.badRequest("变更签约快照请填写原因")
  let snapshot = null
  if (input.contactId) {
    requirePermission(actor, "resource:contact:view")
    const c = (await tx.contacts.find(input.contactId))[0]
    if (!c || c.resourceId !== resourceId || c.status !== "ACTIVE")
      throw AppError.badRequest("请选择本资源的有效联系人")
    snapshot = { name: c.name, position: c.position, phone: c.phone, email: c.email }
  }
  return { resourceId, partnerName: r.name, partnerContactSnapshot: snapshot }
}
export async function syncContractCooperation(
  tx: ResourceConnection,
  actor: Actor,
  c: typeof s.projectContracts.$inferSelect,
) {
  if (!c.resourceId) return
  const old = (await tx.cooperations.all()).find((r) => r.contractId === c.id)
  const values = {
    resourceId: c.resourceId,
    title: c.contractNo || c.partnerName,
    type: "CONTRACT" as const,
    projectId: c.projectId,
    contractId: c.id,
    ownerId: actor.user.id,
    status: "AGREED" as const,
    startDate: c.startDate,
    endDate: c.endDate,
    basis: "关联项目合同",
  }
  if (old) await tx.cooperations.update(old.id, { ...values, version: old.version + 1 })
  else await tx.cooperations.insert(values)
  await touchResource(tx, c.resourceId)
  if (old && old.resourceId !== c.resourceId) await touchResource(tx, old.resourceId)
}
