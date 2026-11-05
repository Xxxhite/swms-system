export interface RegionPathItem {
    code: string
    name: string
}
export interface RegionNode {
    code: string
    name: string
    parentCode: string | null
    level: number
    kind: 'ADMIN' | 'SERVICE'
    enabled: boolean
    children: RegionNode[]
}
export const regionText = (
    value: { regionPathSnapshot?: RegionPathItem[] | null } | null | undefined,
    legacy = '',
) => value?.regionPathSnapshot?.map((r) => r.name).join(' / ') || legacy
