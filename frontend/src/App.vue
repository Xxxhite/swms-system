<script setup lang="ts">
import { ElConfigProvider } from 'element-plus'
import zhCN from 'element-plus/es/locale/lang/zh-cn'
</script>

<template>
    <el-config-provider :locale="zhCN" size="default" :z-index="3000">
        <router-view></router-view>
    </el-config-provider>
</template>

<style scoped></style>
