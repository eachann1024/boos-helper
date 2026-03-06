<script lang="ts" setup>
import {
  ElAvatar,
  ElConfigProvider,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElMessage,
} from 'element-plus'
import { ref } from 'vue'
import logVue from '@/components/conf/log.vue'
import storeVue from '@/components/conf/store.vue'
import userVue from '@/components/conf/user.vue'
import { counter } from '@/message'

const confBox = ref(false)

const confs = {
  store: { name: '存储配置', component: storeVue, disabled: true },
  user: { name: '账号配置', component: userVue, disabled: false },
  log: { name: '日志配置', component: logVue, disabled: true },
}

const confKey = ref<keyof typeof confs>('store')
const dark = ref(false)

counter.storageGet('theme-dark', false).then((res) => {
  dark.value = res
})

async function themeChange() {
  dark.value = !dark.value
  if (dark.value) {
    ElMessage({
      message: '已切换到暗黑模式，如有样式没适配且严重影响使用，请反馈',
      duration: 5000,
      showClose: true,
    })
  }
  document.documentElement.classList.toggle('dark', dark.value)
  await counter.storageSet('theme-dark', dark.value)
}
</script>

<template>
  <ElConfigProvider namespace="ehp">
    <ElDropdown trigger="click">
      <ElAvatar
        :size="30"
        src="https://avatars.githubusercontent.com/u/68412205?v=4"
      >
        H
      </ElAvatar>
      <template #dropdown>
        <ElDropdownMenu>
          <ElDropdownItem disabled>
            BossHelp配置项
          </ElDropdownItem>
          <ElDropdownItem divided disabled />
          <ElDropdownItem
            v-for="(v, k) in confs"
            :key="k"
            :disabled="v.disabled"
            @click="
              confKey = k;
              confBox = true;
            "
          >
            {{ v.name }}
          </ElDropdownItem>
          <ElDropdownItem disabled @click="themeChange">
            暗黑模式（{{ dark ? "开" : "关" }}）
          </ElDropdownItem>
        </ElDropdownMenu>
      </template>
    </ElDropdown>
    <Teleport to="body">
      <component :is="confs[confKey].component" id="help-conf-box" v-model="confBox" />
    </Teleport>
  </ElConfigProvider>
</template>


