/** 审批复用业务事务仓储，保证任务决策与月报替换同事务生效。 */
export {
  ProjectRepository as ApprovalRepository,
  projectRepository as approvalRepository,
} from "@/modules/project/project.repository"
