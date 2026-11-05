import { http } from '@/api/request'
import { useMock } from '@/api/config'
import type { RegionNode, RegionPathItem } from '@/api/region-types'
const base: RegionNode[] = [
    {
        code: '440000',
        name: '广东省',
        parentCode: null,
        level: 1,
        kind: 'ADMIN',
        enabled: true,
        children: [
            {
                code: '440300',
                name: '深圳市',
                parentCode: '440000',
                level: 2,
                kind: 'ADMIN',
                enabled: true,
                children: [
                    {
                        code: '440304',
                        name: '福田区',
                        parentCode: '440300',
                        level: 3,
                        kind: 'ADMIN',
                        enabled: true,
                        children: [],
                    },
                ],
            },
        ],
    },
]
let cached: Promise<{ dataVersion: string; tree: RegionNode[] }> | undefined
export const regionApi = {
    tree: () => {
        if (useMock) return Promise.resolve({ dataVersion: 'demo', tree: base })
        if (!cached)
            cached = http
                .get<{ dataVersion: string; tree: RegionNode[] }>('/regions/tree')
                .catch((error) => {
                    cached = undefined
                    throw error
                })
        return cached
    },
    path: (code: string) => http.get<RegionPathItem[]>(`/regions/${encodeURIComponent(code)}`),
}
