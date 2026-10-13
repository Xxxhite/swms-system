<script setup lang="ts">
import { computed } from 'vue'

import { useMock } from '@/api/config'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

const menuCount = computed(() => userStore.menus.length)
</script>

<template>
    <div class="dashboard">
        <el-alert
            v-if="useMock"
            type="info"
            show-icon
            :closable="false"
            title="当前为本地 mock 模式：登录与用户信息由前端模拟，数据库表结构确定后再切到真实接口。"
        />

        <el-card class="dashboard__card">
            <template #header>登录状态</template>
            <el-descriptions :column="2" border>
                <el-descriptions-item label="账号">{{
                    userStore.profile?.username
                }}</el-descriptions-item>
                <el-descriptions-item label="姓名">{{
                    userStore.profile?.name
                }}</el-descriptions-item>
                <el-descriptions-item label="角色">
                    {{ userStore.profile?.roleNames.join('、') }}
                </el-descriptions-item>
                <el-descriptions-item label="所属团队">
                    {{ userStore.profile?.teamName }}
                </el-descriptions-item>
                <el-descriptions-item label="数据范围">{{
                    userStore.dataScopeText
                }}</el-descriptions-item>
                <el-descriptions-item label="可见菜单">{{ menuCount }} 项</el-descriptions-item>
                <el-descriptions-item label="功能权限" :span="2">
                    {{ userStore.permissions.length }} 项
                </el-descriptions-item>
            </el-descriptions>
        </el-card>

        <el-card class="dashboard__card">
            <template #header>当前进度</template>
            <el-timeline>
                <el-timeline-item timestamp="已完成" type="success">
                    仓库脚手架、后端数据库层、后端基础设施（统一响应与全局错误处理）
                </el-timeline-item>
                <el-timeline-item timestamp="已完成" type="success">
                    前端骨架：登录、布局、按角色渲染的动态菜单与按钮权限判断
                </el-timeline-item>
                <el-timeline-item timestamp="进行中" type="warning">
                    机构业务调研：收集空白文书模板与统计表格
                </el-timeline-item>
                <el-timeline-item timestamp="待开展">
                    数据库表结构设计（9 类档案、合同包指标）→ 业务模块接口 → 各模块页面
                </el-timeline-item>
            </el-timeline>
        </el-card>
    </div>
</template>

<style scoped>
.dashboard__card {
    margin-top: 16px;
}
</style>
