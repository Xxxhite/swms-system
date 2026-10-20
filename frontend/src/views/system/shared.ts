import type { Organization } from '@/api/types'
export interface OrganizationNode extends Organization {
    children: OrganizationNode[]
}
/** 将后端的平面组织集合转成树，复制节点以保持接口原数据不变。 */
export function organizationTree(rows: Organization[]): OrganizationNode[] {
    const nodes = new Map(rows.map((row) => [row.id, { ...row, children: [] } as OrganizationNode]))
    const roots: OrganizationNode[] = []
    for (const node of nodes.values()) {
        const parent = node.parentId === null ? undefined : nodes.get(node.parentId)
        // 数据范围可能只返回局部组织；父节点不在集合中时，将该节点作为可见树的根。
        if (parent) parent.children.push(node)
        else roots.push(node)
    }
    return roots
}
export const scopeOptions = [
    { value: 'SELF', label: '本人' },
    { value: 'TEAM', label: '本团队' },
    { value: 'SUBTREE', label: '负责组织及下级' },
    { value: 'ALL', label: '全机构' },
]
