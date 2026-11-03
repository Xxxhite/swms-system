<script setup lang="ts">
import { ref } from 'vue'
defineOptions({ inheritAttrs: false })
const expanded = ref(false)
</script>
<template>
    <div class="filter-panel" :class="{ 'is-collapsed': !expanded }">
        <el-button
            class="filter-panel__toggle"
            :aria-expanded="expanded"
            @click="expanded = !expanded"
        >
            {{ expanded ? '收起筛选' : '展开全部筛选' }}
        </el-button>
        <el-form v-bind="$attrs" class="filter-form"><slot /></el-form>
    </div>
</template>
