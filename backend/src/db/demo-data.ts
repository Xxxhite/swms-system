import { eq, getTableName } from "drizzle-orm"
import { dirname, resolve } from "node:path"
import { unlink } from "node:fs/promises"
import * as s from "./schema"
import type { Database } from "@/modules/identity/identity.repository"
import { IdentityRepository } from "@/modules/identity/identity.repository"
import { IdentityService } from "@/modules/identity/identity.service"
import { seedIdentity } from "@/modules/identity/identity.seed.repository"
import { dictionaries, positions, canSupervise } from "@/modules/identity/identity.constants"
import { ProjectRepository } from "@/modules/project/project.repository"
import { ProjectService } from "@/modules/project/project.service"
import { ServiceService } from "@/modules/service/service.service"
import { MonthlyChangeService } from "@/modules/service/monthly-change.service"
import { ApprovalService } from "@/modules/approval/approval.service"
import { FileService } from "@/modules/file/file.service"
import { businessToday, subtractMonths } from "@/modules/service/indicator-calculation"
import { hashPassword } from "@/utils/password"
import { safeUser } from "@/utils/authorization"

/** 顺序遵守外键；旧业务表也清空，仅保留迁移记录，不重置自增ID。 */
export const demoResetTables = [
  s.approvalRecords,
  s.approvalTasks,
  s.approvalInstances,
  s.monthlyReportChanges,
  s.monthlyReports,
  s.contractFiles,
  s.projectMemberships,
  s.teamIndicatorTargets,
  s.projectIndicators,
  s.projectTeams,
  s.projectServicePoints,
  s.projectContracts,
  s.projects,
  s.headquartersProjects,
  s.legacyMonthlyReportChanges,
  s.legacyMonthlyReports,
  s.legacyTeamIndicatorTargets,
  s.legacyProjectIndicators,
  s.legacyProjectTeams,
  s.legacyProjectServicePoints,
  s.legacyProjectContracts,
  s.legacyProjects,
  s.auditLogs,
  s.userManagedOrgs,
  s.userExtraPermissions,
  s.userRoles,
  s.rolePermissions,
  s.users,
  s.roles,
  s.permissions,
  s.organizations,
] as const

/** 破坏性入口须显式指定本机库，生产环境和未知表均拒绝。 */
export function assertDemoTarget(input: {
  host: string | undefined
  database: string | undefined
  actualDatabase: string
  confirmedDatabase: string | undefined
  nodeEnv: string | undefined
  reset: boolean
  tables: string[]
}) {
  const { database } = input
  if (
    !input.reset ||
    input.nodeEnv === "production" ||
    !["127.0.0.1", "localhost", "::1"].includes(input.host ?? "") ||
    !database ||
    !(database === "swms" || /^swms_test_[a-z0-9_]+$/.test(database)) ||
    input.actualDatabase !== database ||
    input.confirmedDatabase !== database
  )
    throw new Error("只允许显式 --reset --database=本机开发库，生产环境禁止重建")
  const known = new Set<string>([
    ...demoResetTables.map((table) => getTableName(table)),
    "__drizzle_migrations",
  ])
  if (input.tables.some((name) => !known.has(name)) || input.tables.length !== known.size)
    throw new Error("数据表与当前31表结构不一致，请先核对正式迁移")
}

type PersonDefinition = {
  username: string
  name: string
  position: string | null
  role: string
  org: string
  supervisor: string | null
  scope: (typeof s.dataScopes)[number]
  status?: (typeof s.accountStatuses)[number]
  isSupervisor?: boolean
}

const people: PersonDefinition[] = [
  {
    username: "chief",
    name: "测试·陈负责人",
    position: "position-11",
    role: "project_manager",
    org: "headquarters",
    supervisor: null,
    scope: "ALL",
  },
  {
    username: "admin",
    name: "测试·机构管理员",
    position: "position-12",
    role: "admin",
    org: "headquarters",
    supervisor: "chief",
    scope: "ALL",
  },
  {
    username: "executive",
    name: "测试·林高管",
    position: "position-10",
    role: "project_manager",
    org: "headquarters",
    supervisor: "chief",
    scope: "ALL",
  },
  {
    username: "department",
    name: "测试·周部门总监",
    position: "position-9",
    role: "project_manager",
    org: "demo-service",
    supervisor: "executive",
    scope: "SUBTREE",
  },
  {
    username: "department_b",
    name: "测试·吴部门总监",
    position: "position-9",
    role: "project_manager",
    org: "demo-other",
    supervisor: "executive",
    scope: "SUBTREE",
  },
  {
    username: "project_manager",
    name: "测试·李项目总监",
    position: "position-6",
    role: "project_manager",
    org: "demo-service",
    supervisor: "department",
    scope: "ALL",
  },
  {
    username: "manager_b",
    name: "测试·郑项目总监",
    position: "position-6",
    role: "project_manager",
    org: "demo-other",
    supervisor: "department_b",
    scope: "SUBTREE",
  },
  {
    username: "supervisor",
    name: "测试·王高级主任",
    position: "position-8",
    role: "supervisor",
    org: "demo-service",
    supervisor: "project_manager",
    scope: "SUBTREE",
    isSupervisor: true,
  },
  {
    username: "senior_director",
    name: "测试·赵高级主任",
    position: "position-8",
    role: "project_manager",
    org: "demo-other",
    supervisor: "manager_b",
    scope: "SUBTREE",
  },
  {
    username: "hq_specialist",
    name: "测试·钱总部专员",
    position: "position-7",
    role: "social",
    org: "headquarters",
    supervisor: "department",
    scope: "SELF",
  },
  {
    username: "leader",
    name: "测试·孙团队主任",
    position: "position-4",
    role: "leader",
    org: "demo-team-a",
    supervisor: "supervisor",
    scope: "TEAM",
  },
  {
    username: "leader_b",
    name: "测试·冯团队主任",
    position: "position-4",
    role: "leader",
    org: "demo-team-b",
    supervisor: "supervisor",
    scope: "TEAM",
  },
  {
    username: "leader_c",
    name: "测试·何团队主任",
    position: "position-4",
    role: "leader",
    org: "demo-team-c",
    supervisor: "senior_director",
    scope: "TEAM",
  },
  {
    username: "leader_d",
    name: "测试·许团队主任",
    position: "position-4",
    role: "leader",
    org: "demo-team-d",
    supervisor: "senior_director",
    scope: "TEAM",
  },
  {
    username: "social",
    name: "测试·张社工",
    position: "position-3",
    role: "social",
    org: "demo-team-a",
    supervisor: "leader",
    scope: "TEAM",
  },
  {
    username: "other_social",
    name: "测试·刘社工",
    position: "position-3",
    role: "social",
    org: "demo-team-b",
    supervisor: "leader_b",
    scope: "TEAM",
  },
  {
    username: "social_c",
    name: "测试·杨社工",
    position: "position-3",
    role: "social",
    org: "demo-team-c",
    supervisor: "leader_c",
    scope: "TEAM",
  },
  {
    username: "assistant",
    name: "测试·黄助理",
    position: "position-2",
    role: "social",
    org: "demo-team-d",
    supervisor: "leader_d",
    scope: "TEAM",
  },
  {
    username: "intern",
    name: "测试·朱实习生",
    position: "position-1",
    role: "intern",
    org: "demo-team-a",
    supervisor: "leader",
    scope: "SELF",
  },
  {
    username: "pending",
    name: "测试·胡待审核",
    position: null,
    role: "",
    org: "unassigned",
    supervisor: null,
    scope: "SELF",
    status: "PENDING",
  },
  {
    username: "rejected",
    name: "测试·高已驳回",
    position: null,
    role: "",
    org: "unassigned",
    supervisor: null,
    scope: "SELF",
    status: "REJECTED",
  },
  {
    username: "disabled",
    name: "测试·罗已停用",
    position: "position-3",
    role: "social",
    org: "demo-team-c",
    supervisor: "leader_c",
    scope: "TEAM",
    status: "DISABLED",
  },
  {
    username: "left",
    name: "测试·梁已离职",
    position: "position-3",
    role: "social",
    org: "demo-team-d",
    supervisor: "leader_d",
    scope: "TEAM",
    status: "LEFT",
  },
  {
    username: "social_d",
    name: "测试·宋社工",
    position: "position-3",
    role: "social",
    org: "demo-team-d",
    supervisor: "leader_d",
    scope: "TEAM",
  },
]

/** 最小合法PDF，内容明确为演示资料，文本仅用ASCII避免额外字体依赖。 */
function samplePdf(code: string, attachment: number) {
  const stream = `BT /F1 16 Tf 50 760 Td (SWMS DEMONSTRATION CONTRACT) Tj 0 -30 Td /F1 11 Tf (${code} - attachment ${attachment}) Tj 0 -25 Td (Fictional test data. Not a signed contract.) Tj ET`
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ]
  let content = "%PDF-1.4\n"
  const offsets = [0]
  for (const [i, object] of objects.entries()) {
    offsets.push(content.length)
    content += `${i + 1} 0 obj\n${object}\nendobj\n`
  }
  const xref = content.length
  content += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return content
}

function filePath(directory: string, key: string) {
  const target = resolve(directory, key)
  if (!/^[a-zA-Z0-9_-]+$/.test(key) || dirname(target) !== resolve(directory))
    throw new Error("附件存储键异常，拒绝文件清理")
  return target
}

export interface DemoDataInput {
  adminPassword: string
  demoPassword: string
  uploadDir: string
}

/** 清理及创建共用一个外层事务；业务服务使用同连接保存点，失败回滚旧数据。 */
export async function rebuildDemoData(database: Database, input: DemoDataInput) {
  if ([input.adminPassword, input.demoPassword].some((p) => p.length < 8 || p.length > 128))
    throw new Error("测试密码须为8—128字符")
  const createdKeys: string[] = []
  const oldFiles = await database.select().from(s.contractFiles)
  const oldPaths = oldFiles.map((f) => filePath(input.uploadDir, f.storageKey))
  let result
  try {
    result = await database.transaction(async (transaction) => {
      // 服务和初始化只使用查询及嵌套transaction；MySQL事务对象提供相同接口。
      const tx = transaction as unknown as Database
      await tx.update(s.users).set({ supervisorId: null, reviewedBy: null })
      await tx.update(s.organizations).set({ parentId: null })
      for (const table of demoResetTables) await tx.delete(table)
      await seedIdentity(tx, { adminUsername: "admin", adminPassword: input.adminPassword })
      const today = businessToday()
      const orgs = new Map((await tx.select().from(s.organizations)).map((o) => [o.code, o.id]))
      for (const [code, name, type, parent] of [
        ["demo-service", "馨守护服务部（测试）", "DEPARTMENT", "headquarters"],
        ["demo-other", "馨生活服务部（测试）", "DEPARTMENT", "headquarters"],
        ["demo-team-a", "社区守护团队（测试）", "TEAM", "demo-service"],
        ["demo-team-b", "新就业服务团队（测试）", "TEAM", "demo-service"],
        ["demo-team-c", "长者关爱团队（测试）", "TEAM", "demo-other"],
        ["demo-team-d", "家庭支持团队（测试）", "TEAM", "demo-other"],
      ] as const) {
        const [row] = await tx
          .insert(s.organizations)
          .values({ code, name, type, parentId: orgs.get(parent)! })
        orgs.set(code, row.insertId)
      }
      const roles = new Map((await tx.select().from(s.roles)).map((r) => [r.code, r.id]))
      const demoHash = await hashPassword(input.demoPassword)
      const ids = new Map((await tx.select().from(s.users)).map((u) => [u.username, u.id]))
      for (const [index, person] of people.entries()) {
        const fields = [
          dictionaries.serviceFields[index % 23]!.code,
          dictionaries.serviceFields[(index + 5) % 23]!.code,
        ]
        const status = person.status ?? "ACTIVE"
        const profile = {
          name: person.name,
          phone: `1990000${String(index + 1).padStart(4, "0")}`,
          arrivalDate: subtractMonths(today, (index % 6) + 1),
          major: ["社会工作", "心理学", "社会学"][index % 3]!,
          socialWorkerNo: ["position-1", "position-2"].includes(person.position ?? "")
            ? "测试·尚未持证"
            : `TEST-SW-${String(index + 1).padStart(4, "0")}`,
          serviceFieldCode: fields[0],
          serviceFieldCodes: fields,
          isSupervisor: person.isSupervisor ?? false,
          proposedPosition: positions.find((p) => p.code === person.position)?.name ?? "社工",
          proposedTeam:
            person.org === "unassigned"
              ? "社区守护团队（测试）"
              : (
                  await tx
                    .select()
                    .from(s.organizations)
                    .where(eq(s.organizations.id, orgs.get(person.org)!))
                )[0]!.name,
          orgId: orgs.get(person.org)!,
          positionCode: person.position,
          education: dictionaries.education[index % dictionaries.education.length]!.code,
          politicalStatus:
            dictionaries.politicalStatus[index % dictionaries.politicalStatus.length]!.code,
          dataScope: person.scope,
          status,
          reviewComment:
            status === "PENDING"
              ? null
              : status === "REJECTED"
                ? "测试审核：请补充服务经历后重新提交"
                : "测试资料已核验",
          reviewedAt: status === "PENDING" ? null : new Date(),
        }
        let id = ids.get(person.username)
        if (id) await tx.update(s.users).set(profile).where(eq(s.users.id, id))
        else {
          const [row] = await tx
            .insert(s.users)
            .values({ ...profile, username: person.username, passwordHash: demoHash })
          id = row.insertId
          ids.set(person.username, id)
        }
        if (person.role && person.username !== "admin")
          await tx.insert(s.userRoles).values({ userId: id, roleId: roles.get(person.role)! })
        if (person.scope === "SUBTREE")
          await tx.insert(s.userManagedOrgs).values({ userId: id, orgId: orgs.get(person.org)! })
      }
      for (const person of people) {
        await tx
          .update(s.users)
          .set({
            supervisorId: person.supervisor ? ids.get(person.supervisor)! : null,
            reviewedBy:
              person.status === "PENDING"
                ? null
                : ids.get(person.username === "admin" ? "chief" : "admin")!,
          })
          .where(eq(s.users.id, ids.get(person.username)!))
      }
      await tx
        .insert(s.userExtraPermissions)
        .values(
          [
            "system:view",
            "system:user:view",
            "project:record:view",
            "service:monthly:view",
            "service:indicator:view",
            "service:monitor:view",
          ].map((permissionCode) => ({ userId: ids.get("intern")!, permissionCode })),
        )
      const users = await tx.select().from(s.users)
      await tx.insert(s.auditLogs).values(
        users.map((u) => ({
          actorId: ids.get("admin")!,
          action: "update-user",
          entityType: "user",
          entityId: u.id,
          afterData: safeUser(u),
        })),
      )

      const identities = new IdentityService(new IdentityRepository(tx))
      const repository = new ProjectRepository(tx)
      const projects = new ProjectService(repository)
      const records = new ServiceService(repository)
      const changes = new MonthlyChangeService(repository)
      const approvals = new ApprovalService(repository)
      const files = new FileService(repository, input.uploadDir)
      const approved: Array<{ id: number; username: string }> = []
      const decide = async (recordId: number, username: string, approve: boolean) => {
        const applicant = users.find((u) => u.username === username)!
        const actor = await identities.actor(applicant.supervisorId!)
        const task = (await approvals.tasks(actor, { status: "PENDING", pageSize: 100 })).list.find(
          (t) =>
            t.instance?.businessSnapshot &&
            (t.instance.businessSnapshot as { reportId?: number }).reportId === recordId,
        )
        if (!task) throw new Error("测试审批待办未生成")
        await approvals.decide(
          actor,
          task.id,
          task.version,
          approve,
          approve ? "测试核验通过" : "测试驳回：请补充服务说明",
        )
      }
      const definitions = [
        {
          name: "馨守护·社区未成年人支持（测试）",
          manager: "project_manager",
          senior: "supervisor",
          supervisor: "supervisor",
          teams: ["demo-team-a"],
          reporters: ["social"],
          field: "社区建设",
          sub: ["未成年人保护", "志愿者服务"],
          brands: ["馨守护", "馨+"],
          months: 5,
          area: "福田区",
        },
        {
          name: "馨起点·新就业群体服务（测试）",
          manager: "project_manager",
          senior: "department",
          supervisor: "supervisor",
          teams: ["demo-team-b"],
          reporters: ["other_social"],
          field: "就业援助",
          sub: ["新就业群体服务"],
          brands: ["馨起点"],
          months: 10,
          area: "南山区",
        },
        {
          name: "馨生活·长者与家庭支持（测试）",
          manager: "manager_b",
          senior: "senior_director",
          supervisor: null,
          teams: ["demo-team-c", "demo-team-d"],
          reporters: ["social_c", "social_d"],
          field: "婚姻家庭",
          sub: ["长者服务", "妇女家庭服务"],
          brands: ["馨生活", "馨生剧团"],
          months: 2,
          area: "罗湖区",
        },
        {
          name: "心理服务筹备合同包（测试）",
          manager: "project_manager",
          senior: "supervisor",
          supervisor: null,
          teams: [],
          reporters: [],
          field: "其他-心理服务",
          sub: [],
          brands: [],
          months: 12,
          area: "宝安区",
        },
      ]
      for (const [projectIndex, definition] of definitions.entries()) {
        const actor = await identities.actor(ids.get(definition.manager)!)
        const startDate = subtractMonths(today, 6),
          endDate = subtractMonths(today, -definition.months)
        const code = `DEMO3-${projectIndex + 1}`
        const { id } = await projects.create(actor, {
          code,
          name: definition.name,
          category: "CONTRACT_PACKAGE",
          ownerOrgId: orgs.get(projectIndex === 2 ? "demo-other" : "demo-service")!,
          directorId: ids.get(definition.manager)!,
          seniorDirectorId: ids.get(definition.senior)!,
          supervisorId: definition.supervisor ? ids.get(definition.supervisor)! : null,
          serviceFieldCode: definition.field,
          subFieldCodes: definition.sub,
          brandCodes: definition.brands,
        })
        const detail = () => projects.detail(actor, id)
        await projects.contract(
          actor,
          id,
          {
            contractNo: `TEST-CONTRACT-${projectIndex + 1}`,
            partnerName: `虚构合作单位${projectIndex + 1}（测试）`,
            startDate,
            endDate,
            amount: `${(projectIndex + 1) * 150000}.00`,
            serviceArea: definition.area,
            note: "全为虚构测试资料，用于系统功能验证",
          },
          (await detail()).version,
        )
        await projects.points(
          actor,
          id,
          [1, 2].map((n) => ({
            name: `${definition.area}测试服务点${n}`,
            address: `${definition.area}虚构测试路${n}号`,
            note: "虚构地址，仅用于功能测试",
          })),
          (await detail()).version,
        )
        if (definition.teams.length) {
          await projects.teams(
            actor,
            id,
            definition.teams.map((code, index) => ({
              teamId: orgs.get(code)!,
              reporterId: ids.get(definition.reporters[index]!)!,
            })),
            (await detail()).version,
          )
          await projects.members(
            actor,
            id,
            users
              .filter(
                (u) =>
                  u.status === "ACTIVE" &&
                  definition.teams.some((code) => orgs.get(code) === u.orgId),
              )
              .map((u) => ({ userId: u.id, teamId: u.orgId!, startDate, endDate })),
            (await detail()).version,
          )
          await projects.state(actor, id, (await detail()).version, "activate")
        }
        for (let attachment = 1; attachment <= 2; attachment++) {
          const uploaded = await files.upload(
            actor,
            id,
            new File(
              [samplePdf(code, attachment)],
              attachment === 1 ? "测试合同正文.pdf" : "测试合同补充协议.pdf",
              { type: "application/pdf" },
            ),
          )
          const [stored] = await tx
            .select()
            .from(s.contractFiles)
            .where(eq(s.contractFiles.id, uploaded.id))
          createdKeys.push(stored!.storageKey)
        }
        const indicatorNames = ["个别服务参与", "主题小组活动", "社区探访", "志愿者支持"]
        for (let index = 0; index < (definition.teams.length ? 4 : 2); index++) {
          const targetValue = index === 0 ? "10.00" : `${(index + 1) * 100}.00`
          const created = await projects.indicator(actor, id, {
            name: indicatorNames[index]!,
            unit: index === 1 ? "场" : "人次",
            definition: "每次完成服务后记录本次指标增量，经直接主管审批后累计",
            targetValue,
          })
          if (!definition.teams.length) continue
          const indicator = () =>
            detail().then((p) => p.indicators.find((i) => i.id === created.id)!)
          await projects.allocations(
            actor,
            id,
            created.id,
            definition.teams.map((code) => ({
              teamId: orgs.get(code)!,
              targetValue: (Number(targetValue) / definition.teams.length).toFixed(2),
            })),
            (await indicator()).version,
          )
          await projects.indicatorState(
            actor,
            id,
            created.id,
            (await indicator()).version,
            "activate",
          )
          for (let event = 0; event < 5; event++) {
            const teamIndex = event % definition.teams.length
            const username = definition.reporters[teamIndex]!
            const reporter = await identities.actor(ids.get(username)!)
            const date = new Date(`${today}T00:00:00Z`)
            date.setUTCDate(date.getUTCDate() - (projectIndex * 8 + index * 15 + event + 1))
            const record = await records.save(reporter, {
              indicatorId: created.id,
              teamId: orgs.get(definition.teams[teamIndex]!)!,
              serviceDate: date.toISOString().slice(0, 10),
              actualValue: ["10.00", "5.00", "3.00", "2.00", "1.00"][event]!,
              requestKey: `demo3-${id}-${created.id}-${event}`,
              note: `测试服务记录：${definition.name}，${indicatorNames[index]}，第${event + 1}次`,
            })
            if (event === 3) continue
            await records.state(reporter, record.id, 1, "submit")
            if (event === 2) continue
            await decide(record.id, username, event !== 4)
            if (event < 2) approved.push({ id: record.id, username })
          }
        }
      }
      const changeCases = [
        { index: 0, operation: "CORRECT", decision: true },
        { index: 1, operation: "CORRECT", decision: null },
        { index: 2, operation: "CORRECT", decision: false },
        { index: 3, operation: "DELETE", decision: true },
        { index: 3, operation: "RESTORE", decision: true },
        { index: 4, operation: "DELETE", decision: true },
        { index: 5, operation: "DELETE", decision: null },
        { index: 6, operation: "CORRECT", decision: null },
      ] as const
      for (const item of changeCases) {
        const original = approved[item.index]!
        const actor = await identities.actor(ids.get(original.username)!)
        const record = await records.detail(actor, original.id)
        await changes.create(actor, original.id, {
          version: record.version,
          operation: item.operation,
          actualValue: (Number(record.actualValue) + 1).toFixed(2),
          reason: `测试${item.operation}申请`,
          note: "虚构审批流程示例",
        })
        if (item.decision !== null) await decide(original.id, original.username, item.decision)
      }
      await tx.insert(s.headquartersProjects).values([
        {
          code: "DEMO3-HQ",
          name: "机构能力建设总部项目（测试）",
          category: "HEADQUARTERS",
          ownerOrgId: orgs.get("headquarters")!,
          directorId: ids.get("executive")!,
        },
        {
          code: "DEMO3-FUND",
          name: "社区公益基金项目（测试）",
          category: "FUND",
          ownerOrgId: orgs.get("headquarters")!,
          directorId: ids.get("chief")!,
        },
      ])
      return inspectDemoData(tx)
    })
  } catch (error) {
    for (const key of createdKeys) await unlink(filePath(input.uploadDir, key)).catch(() => {})
    throw error
  }
  for (const path of oldPaths)
    await unlink(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error
    })
  return result
}

/** 对完整数据集复核业务一致性，并返回不含密码哈希的人员目录。 */
export async function inspectDemoData(database: Database) {
  const users = await database.select().from(s.users)
  const memberships = await database.select().from(s.projectMemberships)
  if (users.length !== 24 || new Set(users.map((u) => u.phone)).size !== 24)
    throw new Error("测试人员数量或联系电话重复")
  for (const user of users) {
    if (
      !user.serviceFieldCodes.length ||
      user.serviceFieldCodes.some(
        (code) => !dictionaries.serviceFields.some((f) => f.code === code),
      ) ||
      !user.socialWorkerNo ||
      !user.proposedTeam ||
      !user.major ||
      !user.education ||
      !user.politicalStatus
    )
      throw new Error("测试人员资料未补齐")
    if (user.isSupervisor && !canSupervise(user.positionCode)) throw new Error("测试督导资格不符")
    let current = user
    const seen = new Set<number>()
    while (current.supervisorId !== null) {
      if (seen.has(current.id)) throw new Error("测试主管关系成环")
      seen.add(current.id)
      current = users.find((u) => u.id === current.supervisorId)!
      if (!current || current.status !== "ACTIVE") throw new Error("测试直接主管未启用")
    }
    if (
      user.status === "ACTIVE" &&
      ["position-1", "position-2", "position-3", "position-4"].includes(user.positionCode ?? "") &&
      memberships.filter((m) => m.userId === user.id).length !== 1
    )
      throw new Error("低岗位必须有唯一合同包归属")
  }
  const counts: Record<string, number> = {}
  for (const table of demoResetTables)
    counts[getTableName(table)] = (await database.select().from(table)).length
  if (
    counts.contract_projects !== 4 ||
    counts.service_records !== 60 ||
    counts.contract_indicators !== 14 ||
    counts.contract_files !== 8 ||
    counts.headquarters_projects !== 2 ||
    counts.service_record_changes !== 8
  )
    throw new Error("测试业务数量不符")
  return { createdAt: new Date().toISOString(), counts, accounts: users.map((u) => safeUser(u)) }
}
