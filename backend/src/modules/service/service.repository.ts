/** 月报与指标复用项目事务快照，避免另起连接破坏提交一致性。 */
export {
  ProjectRepository as ServiceRepository,
  projectRepository as serviceRepository,
} from "@/modules/project/project.repository"
