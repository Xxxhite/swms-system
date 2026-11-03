<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { executionApi } from '@/api/modules/execution'
import type { Evidence } from '@/api/execution-types'
import { useUserStore } from '@/stores/user'
const ids = defineModel<number[]>({ required: true }),
    props = defineProps<{ taskId: number }>(),
    store = useUserStore()
const rows = ref<Evidence[]>([]),
    busy = ref(false),
    fileInput = ref<HTMLInputElement>()
const pending = ref<Array<{ file: File; requestKey: string }>>([])
async function load() {
    try {
        rows.value = (await executionApi.evidence(props.taskId)).filter(
            (f) => !f.boundKind && f.uploadedBy === store.profile?.id,
        )
    } catch {
        /* 请求层提示 */
    }
}
async function uploadPending() {
    busy.value = true
    try {
        while (pending.value.length) {
            const item = pending.value[0]!
            const saved = await executionApi.upload(props.taskId, item.file, item.requestKey)
            ids.value = [...new Set([...ids.value, saved.id])]
            pending.value.shift()
        }
    } catch {
        /* 保留文件与原请求键，由本人在本页重试 */
    } finally {
        busy.value = false
        await load()
    }
}
async function pick(event: Event) {
    const input = event.target as HTMLInputElement
    for (const file of Array.from(input.files ?? [])) {
        if (file.size > 10 * 1024 * 1024) {
            ElMessage.warning('每份凭证最多10MB')
            continue
        }
        if (
            !pending.value.some(
                (item) =>
                    item.file.name === file.name &&
                    item.file.size === file.size &&
                    item.file.lastModified === file.lastModified,
            )
        )
            pending.value.push({ file, requestKey: crypto.randomUUID() })
    }
    input.value = ''
    await uploadPending()
}
onMounted(load)
</script>
<template>
    <div>
        <input
            ref="fileInput"
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            multiple
            hidden
            @change="pick"
        />
        <el-button :loading="busy" @click="fileInput?.click()">上传现场凭证</el-button>
        <el-button v-if="pending.length && !busy" type="warning" @click="uploadPending">
            重试待确认上传（{{ pending.length }}）
        </el-button>
        <p class="evidence-picker__hint">
            JPEG、PNG或PDF，每份最多10MB。仅选中的凭证会关联本次记录。
        </p>
        <el-checkbox-group v-model="ids">
            <el-checkbox v-for="f in rows" :key="f.id" :value="f.id">{{ f.name }}</el-checkbox>
        </el-checkbox-group>
    </div>
</template>
<style scoped>
.evidence-picker__hint {
    color: var(--el-text-color-secondary);
    font-size: 14px;
}
.el-checkbox-group {
    display: flex;
    flex-direction: column;
}
</style>
