import { ElMessage } from 'element-plus'
import { apiBaseUrl } from '@/api/config'
import { createParticipationClient } from '@/api/participation-client'
import type { ParticipationPage } from '@/api/execution-types'
const http = createParticipationClient(apiBaseUrl, (message) => ElMessage.error(message))
export const participationApi = {
    resolve: (token: string): Promise<ParticipationPage> =>
        http.post('/execution/participation/resolve', { token }),
    confirm: (
        token: string,
        confirmerRole: 'SELF' | 'FAMILY' | 'COMPANION',
        relation: string,
        requestKey: string,
    ): Promise<{ recorded: boolean; replayed: boolean }> =>
        http.post('/execution/participation/confirm', {
            token,
            confirmerRole,
            relation,
            requestKey,
        }),
}
