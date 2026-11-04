<script setup lang="ts">
import { ref } from 'vue'
import { useViewport } from '@/composables/useViewport'
defineOptions({ inheritAttrs: false })
const expanded = ref(false)
const { isMobile } = useViewport()
</script>
<template>
    <div class="filter-panel" :class="{ 'is-collapsed': isMobile && !expanded }">
        <el-button
            v-if="isMobile"
            class="filter-panel__toggle"
            :aria-expanded="expanded"
            @click="expanded = !expanded"
        >
            {{ expanded ? '收起筛选' : '展开全部筛选' }}
        </el-button>
        <el-form v-bind="$attrs" class="filter-form"><slot /></el-form>
    </div>
</template>
