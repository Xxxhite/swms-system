import { ApprovalService } from "@/modules/approval/approval.service"
import * as s from "@/db/schema"
import type { Database } from "@/modules/identity/identity.repository"
import { IdentityRepository } from "@/modules/identity/identity.repository"
import { IdentityService } from "@/modules/identity/identity.service"
import { ProjectRepository } from "./project.repository"
import { ProjectService } from "./project.service"
import { ServiceService } from "@/modules/service/service.service"
import { businessRoleDefaults } from "./business-permissions"
import { businessToday, subtractMonths } from "@/modules/service/indicator-calculation"
/** 显式补充第二阶段默认业务授权，只增加清单权限，不覆盖角色自定义授权。 */
export async function grantBusinessPermissions(database: Database) {
  await database.transaction(async (tx) => {
    const roles = await tx.select().from(s.roles)
    for (const role of roles) {
      for (const permissionCode of businessRoleDefaults[role.code] ?? [])
        await tx
          .insert(s.rolePermissions)
          .values({ roleId: role.id, permissionCode })
          .onDuplicateKeyUpdate({ set: { permissionCode } })
    }
  })
}
/** 显式生成一套逐次填报演示，保留已有项目、账号及审批数据。 */
export async function seedProjects(database: Database, _adminUsername = "admin") {
  await grantBusinessPermissions(database)
  if ((await database.select().from(s.projects).limit(1)).length) return
  const identities = new IdentityService(new IdentityRepository(database))
  const users = await database.select().from(s.users),
    orgs = await database.select().from(s.organizations)
  const manager = users.find((u) => u.username === "project_manager")
  const first = users.find((u) => u.username === "social"),
    second = users.find((u) => u.username === "other_social")
  const teamA = orgs.find((o) => o.code === "demo-team-a"),
    teamB = orgs.find((o) => o.code === "demo-team-b")
  if (!manager || !first || !second || !teamA || !teamB)
    throw new Error("请先初始化演示管理人员及两个服务团队")
  const actor = await identities.actor(manager.id),
    repository = new ProjectRepository(database),
    projects = new ProjectService(repository),
    records = new ServiceService(repository),
    approval = new ApprovalService(repository)
  const today = businessToday(),
    startDate = subtractMonths(today, 12),
    endDate = subtractMonths(today, -12)
  const { id } = await projects.create(actor, {
    code: "demo-contract",
    name: "虚构合同包服务项目",
    category: "CONTRACT_PACKAGE",
    ownerOrgId: manager.orgId!,
    directorId: manager.id,
    seniorDirectorId: manager.id,
    supervisorId: null,
    serviceFieldCode: "社区建设",
    subFieldCodes: ["长者服务"],
    brandCodes: ["馨生活"],
  })
  let p = await projects.detail(actor, id)
  await projects.contract(
    actor,
    id,
    {
      partnerName: "虚构合作单位",
      startDate,
      endDate,
      amount: "100000.00",
      serviceArea: "演示区域",
    },
    p.version,
  )
  p = await projects.detail(actor, id)
  await projects.teams(
    actor,
    id,
    [
      { teamId: teamA.id, reporterId: first.id },
      { teamId: teamB.id, reporterId: second.id },
    ],
    p.version,
  )
  p = await projects.detail(actor, id)
  await projects.members(
    actor,
    id,
    users
      .filter((u) => [teamA.id, teamB.id].includes(u.orgId ?? 0))
      .map((u) => ({ userId: u.id, teamId: u.orgId!, startDate, endDate })),
    p.version,
  )
  p = await projects.detail(actor, id)
  await projects.state(actor, id, p.version, "activate")
  const { id: indicatorId } = await projects.indicator(actor, id, {
    name: "服务参与",
    unit: "人次",
    definition: "每次服务完成后记录当次参与人次",
    targetValue: "100.00",
  })
  let i = (await projects.detail(actor, id)).indicators.find((i) => i.id === indicatorId)!
  await projects.allocations(
    actor,
    id,
    i.id,
    [
      { teamId: teamA.id, targetValue: "60.00" },
      { teamId: teamB.id, targetValue: "40.00" },
    ],
    i.version,
  )
  i = (await projects.detail(actor, id)).indicators.find((i) => i.id === indicatorId)!
  await projects.indicatorState(actor, id, i.id, i.version, "activate")
  for (const user of [first, second]) {
    const reporter = await identities.actor(user.id)
    const record = await records.save(reporter, {
      indicatorId,
      teamId: user.orgId!,
      serviceDate: today,
      actualValue: "10.00",
      note: "虚构逐次服务记录",
    })
    await records.state(reporter, record.id, 1, "submit")
    if (user.id === first.id && user.supervisorId) {
      const approver = await identities.actor(user.supervisorId)
      const task = (await approval.tasks(approver, { status: "PENDING", pageSize: 100 })).list.find(
        (t) =>
          t.instance?.businessType === "SERVICE_SUBMISSION" && t.instance.businessId === record.id,
      )
      if (task) await approval.decide(approver, task.id, task.version, true, "核实通过")
    }
  }
}
