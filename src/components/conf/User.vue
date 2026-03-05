<script lang="ts" setup>
import type { CookieInfo } from '@/message'
import {
  ElAvatar,
  ElButton,
  ElDialog,
  ElMessage,
  ElMessageBox,
  ElPopconfirm,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus'

import { ref } from 'vue'

import { useUser } from '@/stores/user'
import { logger } from '@/utils/logger'

const user = useUser()

const show = defineModel<boolean>({ required: true })

const currentRow = ref<CookieInfo | undefined>()
const loading = ref(false)

async function handleCreate() {
  loading.value = true
  try {
    const uid = user.getUserId()
    if (uid == null) {
      try {
        await ElMessageBox.confirm(
          '要是不登录进行新账号创建，则当前的所有配置将丢失！',
          '请先登录',
          {
            confirmButtonText: '强制创建',
            cancelButtonText: '取消',
            type: 'warning',
          },
        )
      }
      catch {
        return
      }
    }
    const val = await user.saveUser({ uid })
    if (uid && val) {
      user.cookieDatas.value[uid] = val
    }
    ElMessage.success('账号已保存，正在清空Cookie并刷新页面')
    await user.clearUser()
    setTimeout(() => window.location.reload(), 1500)
  }
  catch (err) {
    logger.error('创建账号失败', err)
    ElMessage.error(`创建账号失败: ${err as string}`)
  }
  finally {
    loading.value = false
  }
}

async function handleChange() {
  loading.value = true
  try {
    if (!currentRow.value) {
      ElMessage.error('请先选择要切换的账号')
      return
    }
    const uid = user.getUserId()
    if (uid == null) {
      try {
        await ElMessageBox.confirm(
          '要是不登录进行切换，则当前的所有配置将丢失！',
          '请先登录',
          {
            confirmButtonText: '强制切换',
            cancelButtonText: '取消',
            type: 'warning',
          },
        )
      }
      catch {
        return
      }
    }
    await user.changeUser(currentRow.value)
    ElMessage.success('账号切换成功，即将刷新页面')
    setTimeout(() => window.location.reload(), 1500)
  }
  catch (err) {
    logger.error('账号切换失败', err)
    ElMessage.error('账号切换失败，请重试')
  }
  finally {
    loading.value = false
  }
}

function handleCurrentChange(val: CookieInfo | undefined) {
  currentRow.value = val
}
</script>

<template>
  <ElDialog
    v-model="show"
    title="账户配置"
    width="70%"
    align-center
    destroy-on-close
    :z-index="20"
  >
    <div class="plain-tip plain-tip--warning">
      使用该功能会明文存储 cookie 信息，可能包含隐私数据。
    </div>
    <div class="plain-tip plain-tip--info">
      每个用户有独立配置，但历史投递信息会全局共享。切换后若未登录通常是 cookie 过期，重新登录即可。
    </div>
    <div class="plain-tip plain-tip--info">
      不要在未登录状态下切换或创建，否则当前配置可能无法保存。
    </div>
    <ElTable
      :data="user.cookieTableData.value"
      style="width: 100%"
      highlight-current-row
      table-layout="auto"
      @current-change="handleCurrentChange"
    >
      <ElTableColumn type="index" width="40" />
      <ElTableColumn label="账户">
        <template #default="scope">
          <div style="align-items: center; display: flex">
            <ElAvatar :src="scope.row.avatar" :size="30" />
            <span style="margin-left: 8px">{{ scope.row.user }}</span>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="性别" align="center">
        <template #default="scope">
          <ElTag
            round
            effect="dark"
            style="border-style: none"
            :color="scope.row.gender === 'man' ? '#9BC1FE' : '#FFBDEB'"
          >
            {{ scope.row.gender === "man" ? "男" : "女" }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="身份" align="center">
        <template #default="scope">
          <ElTag
            effect="dark"
            round
            style="border-style: none"
            :type="scope.row.flag === 'student' ? 'success' : 'warning'"
          >
            {{ scope.row.flag === "student" ? "学生" : "社畜" }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn prop="date" label="上次登录" />
      <ElTableColumn fixed="right" label="操作">
        <template #default="scope">
          <ElButton link type="primary" size="small" disabled>
            导出
          </ElButton>
          <ElButton
            link
            type="primary"
            size="small"
            @click="() => user.deleteUser(scope.row)"
          >
            删除
          </ElButton>
        </template>
      </ElTableColumn>
    </ElTable>
    <template #footer>
      <div>
        <ElButton @click="show = false">
          取消
        </ElButton>
        <ElPopconfirm
          title="确认后将保存数据退出账户并自动刷新"
          @confirm="handleCreate"
        >
          <template #reference>
            <ElButton type="primary" :loading="loading">
              新建&登出
            </ElButton>
          </template>
        </ElPopconfirm>
        <ElButton
          type="primary"
          :disabled="!currentRow"
          :loading="loading"
          @click="handleChange()"
        >
          切换
        </ElButton>
      </div>
    </template>
  </ElDialog>
</template>

<style lang="scss" scoped>
.plain-tip {
  margin: 6px 0;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
}

.plain-tip--warning {
  background: #fdf6ec;
  color: #8a4f08;
}

.plain-tip--info {
  background: #ecf5ff;
  color: #1d4f91;
}
</style>
