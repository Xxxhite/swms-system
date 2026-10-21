import { eq } from "drizzle-orm"
import { ApprovalService } from "@/modules/approval/approval.service"
import * as s from "@/db/schema"
import type { Database } from "@/modules/identity/identity.repository"
import { IdentityRepository } from "@/modules/identity/identity.repository"
import { IdentityService } from "@/modules/identity/identity.service"
import { ProjectRepository } from "./project.repository"
import { ProjectService } from "./project.service"
import { ServiceService } from "@/modules/service/service.service"
import { MonthlyChangeService } from "@/modules/service/monthly-change.service"
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
/** 显式幂等生成虚构项目与跨月数据，已有项目不覆盖；普通启动不会调用。 */
export async function seedProjects(database: Database, adminUsername = "admin") {
  await grantBusinessPermissions(database)
  const identities = new IdentityService(new IdentityRepository(database)),
    users = await database.select().from(s.users),
    orgs = await database.select().from(s.organizations)
  const admin = users.find((u) => u.username === adminUsername),
    first = users.find((u) => u.username === "social"),
    second = users.find((u) => u.username === "other_social"),
    teamA = orgs.find((o) => o.code === "demo-team-a"),
    teamB = orgs.find((o) => o.code === "demo-team-b")
  if (!admin || !first || !second || !teamA || !teamB)
    throw new Error("请先执行演示账号初始化，业务 seed 需要两个虚构团队及填报人")
  const actor = await identities.actor(admin.id),
    repository = new ProjectRepository(database),
    projects = new ProjectService(repository),
    monthly = new ServiceService(repository),
    changes = new MonthlyChangeService(repository)
  const today = businessToday()
  const hadApprovals = (await database.select().from(s.approvalInstances).limit(1)).length > 0
  for (const [index, months] of [8, 5, 2, -1].entries()) {
    const code = `demo-project-${index + 1}`
    if ((await database.select().from(s.projects).where(eq(s.projects.code, code))).length) continue
    const created = await projects.create(actor, {
      code,
      name: `虚构示范项目${index + 1}`,
      category: index === 1 ? "HEADQUARTERS" : index === 2 ? "FUND" : "CONTRACT_PACKAGE",
      ownerOrgId: admin.orgId!,
      directorId: users.find((u) => u.username === "project_manager")?.id ?? admin.id,
      supervisorId: users.find((u) => u.username === "supervisor")?.id ?? admin.id,
      serviceFieldCode: "社区建设",
    })
    let p = await projects.detail(actor, created.id)
    const startDate = subtractMonths(today, 12),
      endDate = subtractMonths(today, -months)
    await projects.contract(
      actor,
      p.id,
      {
        partnerName: "虚构合作单位",
        startDate,
        endDate,
        amount: "100000.00",
        serviceArea: "演示区域",
        note: "仅用于系统演示的虚构合同",
      },
      p.version,
    )
    p = await projects.detail(actor, p.id)
    await projects.teams(
      actor,
      p.id,
      [
        { teamId: teamA.id, reporterId: first.id },
        { teamId: teamB.id, reporterId: second.id },
      ],
      p.version,
    )
    p = await projects.detail(actor, p.id)
    await projects.points(actor, p.id, [{ name: "虚构服务点", address: "演示地址" }], p.version)
    p = await projects.detail(actor, p.id)
    await projects.state(actor, p.id, p.version, "activate")
    for (let n = 0; n < 2; n++) {
      const createdIndicator = await projects.indicator(actor, p.id, {
        name: n ? "主题活动" : "服务参与",
        unit: n ? "场" : "人次",
        definition: n ? "每场完成完整活动流程计一次" : "按当月新增参与人次统计，不去重到其他月份",
        targetValue: n ? "10.00" : "100.00",
      })
      let i = (await projects.detail(actor, p.id)).indicators.find(
        (i) => i.id === createdIndicator.id,
      )!
      await projects.allocations(
        actor,
        p.id,
        i.id,
        [
          { teamId: teamA.id, targetValue: n ? "6.00" : "60.00" },
          { teamId: teamB.id, targetValue: n ? "4.00" : "40.00" },
        ],
        i.version,
      )
      i = (await projects.detail(actor, p.id)).indicators.find((i) => i.id === createdIndicator.id)!
      await projects.indicatorState(actor, p.id, i.id, i.version, "activate")
      for (const [teamId, value] of [
        [teamA.id, n ? "1.00" : "60.00"],
        [teamB.id, n ? "1.00" : "40.00"],
      ] as const) {
        const month = (months < 0 ? endDate : today).slice(0, 7),
          r = await monthly.save(actor, {
            indicatorId: i.id,
            teamId,
            month,
            actualValue: value,
            note: "虚构月度演示数据",
          })
        await monthly.state(actor, r.id, 1, "submit")
        const previous = subtractMonths(month + "-15", 1).slice(0, 7)
        await monthly.save(actor, {
          indicatorId: i.id,
          teamId,
          month: previous,
          actualValue: "0.00",
          note: "历史月份草稿，不计累计",
        })
      }
      if (index === 0 && n === 0 && first.status === "ACTIVE") {
        const approver = users.find((u) => u.id === first.supervisorId && u.status === "ACTIVE")
        if (approver) {
          const r = await monthly.save(actor, {
            indicatorId: i.id,
            teamId: teamA.id,
            month: subtractMonths(today, 2).slice(0, 7),
            actualValue: "0.00",
            note: "虚构示范：已撤销月报",
          })
          await monthly.state(actor, r.id, 1, "submit")
          const c = await changes.create(await identities.actor(first.id), r.id, {
            version: 2,
            operation: "DELETE",
            reason: "示范：撤销重复登记",
          })
          const approval = new ApprovalService(repository)
          const task = (
            await approval.tasks(await identities.actor(approver.id), {
              status: "PENDING",
              pageSize: 100,
            })
          ).list.find((t) => t.instance?.businessId === c.id)
          if (task)
            await approval.decide(
              await identities.actor(approver.id),
              task.id,
              task.version,
              true,
              "确认撤销",
            )
        }
      }
    }
  }
  // 留下一个由真实演示填报人发起的主管待办；不覆盖已有审批数据。
  const existing = hadApprovals
  if (!existing && first.status === "ACTIVE") {
    const [r] = await database
      .select()
      .from(s.monthlyReports)
      .where(eq(s.monthlyReports.teamId, teamA.id))
    if (r?.status === "SUBMITTED")
      await changes.create(await identities.actor(first.id), r.id, {
        version: r.version,
        operation: "CORRECT",
        actualValue: "61.00",
        reason: "虚构示范：补录漏报人次",
      })
  }
  if (!existing && second.status === "ACTIVE") {
    const [r] = await database
      .select()
      .from(s.monthlyReports)
      .where(eq(s.monthlyReports.teamId, teamB.id))
    const approver = users.find((u) => u.id === second.supervisorId && u.status === "ACTIVE")
    if (r?.status === "SUBMITTED" && approver) {
      const c = await changes.create(await identities.actor(second.id), r.id, {
        version: r.version,
        operation: "CORRECT",
        actualValue: r.actualValue,
        reason: "虚构示范：已确认的历史复核",
      })
      const task = (
        await new ApprovalService(repository).tasks(await identities.actor(approver.id), {
          status: "PENDING",
          pageSize: 100,
        })
      ).list.find((t) => t.instance?.businessId === c.id)
      if (task)
        await new ApprovalService(repository).decide(
          await identities.actor(approver.id),
          task.id,
          task.version,
          true,
          "核对通过",
        )
    }
  }
}
