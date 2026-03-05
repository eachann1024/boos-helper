import type { modelData } from '@/composables/useModel'
import type { FormData } from '@/types/formData'
import { watchThrottled } from '@vueuse/core'

import { ElMessage } from 'element-plus'

import { defineStore } from 'pinia'
import { reactive, ref, toRaw } from 'vue'
import { confModelKey, useModel } from '@/composables/useModel'
import { counter } from '@/message'

import { useUser } from '@/stores/user'
import deepmerge, { jsonClone } from '@/utils/deepmerge'
import { exportJson, importJson } from '@/utils/jsonImportExport'
import { logger } from '@/utils/logger'
import { defaultFormData } from './info'

export * from './info'

export const formDataKey = 'local:web-geek-job-FormData'

interface ConfExportPayload {
  __boosHelperExport: 'config'
  schemaVersion: 1
  exportedAt: string
  formData: FormData
  modelData: modelData[]
}

function isConfExportPayload(data: unknown): data is ConfExportPayload {
  if (!data || typeof data !== 'object') {
    return false
  }
  const payload = data as Partial<ConfExportPayload>
  return (
    payload.__boosHelperExport === 'config'
    && payload.schemaVersion === 1
    && !!payload.formData
    && typeof payload.formData === 'object'
    && Array.isArray(payload.modelData)
  )
}

export const useConf = defineStore('conf', () => {
  const formData: FormData = reactive(defaultFormData)
  const isLoaded = ref(false)

  async function persistCurrentConfig(config: FormData) {
    const snapshot = jsonClone(config)
    await counter.storageSet(formDataKey, snapshot)
  }

  const FROM_VERSION: [string, (from: Partial<FormData>) => Partial<FormData>][] = [
    ['20250826', (from) => {
      if (from.salaryRange && typeof from.salaryRange.value === 'string') {
        const [min, max] = (from.salaryRange.value as string).split('-').map(Number)
        from.salaryRange.value = [min, max, false]
      }
      if (from.companySizeRange && typeof from.companySizeRange.value === 'string') {
        const [min, max] = (from.companySizeRange.value as string).split('-').map(Number)
        from.companySizeRange.value = [min, max, false]
      }
      return from
    }],
  ]

  async function formDataHandler(from: Partial<FormData>) {
    try {
      for (let i = FROM_VERSION.length - 1; i >= 0; i--) {
        const [version, fn] = FROM_VERSION[i]
        if ((from?.version ?? '20240401') >= version) {
          break
        }
        from = fn(from)
        from.version = version
      }
      const user = useUser()
      const uid = user.getUserId()
      // eslint-disable-next-line eqeqeq
      if (uid != null && from.userId != null && from.userId != uid) {
        const data = await counter.cookieInfo()
        if (uid in data) {
          await user.changeUser(data[uid])
          ElMessage.success('匹配到账号配置 恢复中, 3s后刷新页面')
          setTimeout(() => window.location.reload(), 3000)
          return
        }
        else {
          ElMessage.success('登录新账号')
          from.userId = uid
        }
      }
      else if (uid != null && from.userId == null) {
        from.userId = uid
      }
    }
    catch (err) {
      logger.error('用户配置初始化失败', err)
      ElMessage.error(`用户配置初始化失败: ${String(err)}`)
    }
    return from
  }

  async function init() {
    let from = await counter.storageGet<Partial<FormData>>(formDataKey, {})
    from = await formDataHandler(from) ?? from
    const data = deepmerge<FormData>(defaultFormData, from)
    Object.assign(formData, data)
    isLoaded.value = true
  }

  watchThrottled(
    formData,
    (v) => {
      logger.debug('formData改变', toRaw(v))
    },
    { throttle: 2000 },
  )

  async function confSaving() {
    const v = jsonClone(formData)
    try {
      await persistCurrentConfig(v)
      logger.debug('formData保存', v)
      ElMessage.success('保存成功, 3s 之后自动刷新')
      setTimeout(() => {
        window.location.reload()
      }, 3000)
    }
    catch (error: any) {
      ElMessage.error(`保存失败: ${error.message}`)
    }
  }

  async function confPersistNow() {
    await persistCurrentConfig(formData)
  }

  async function confReload() {
    const v = deepmerge<FormData>(defaultFormData, await counter.storageGet(formDataKey, {}))
    deepmerge(formData, v, { clone: false })
    logger.debug('formData已重置')
    ElMessage.success('重置成功')
  }

  async function confExport() {
    const modelStore = useModel()
    const data = deepmerge<FormData>(
      defaultFormData,
      jsonClone(formData),
    )
    const exportPayload: ConfExportPayload = {
      __boosHelperExport: 'config',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      formData: data,
      modelData: jsonClone(modelStore.modelData),
    }
    exportJson(exportPayload, '打招呼配置')
  }

  async function confImport() {
    const imported = await importJson<Partial<FormData> | ConfExportPayload>()
    let jsonData: Partial<FormData>
    let importedModelData: modelData[] | undefined

    if (isConfExportPayload(imported)) {
      jsonData = imported.formData
      importedModelData = imported.modelData
    }
    else {
      jsonData = imported
    }

    jsonData.userId = undefined
    jsonData = await formDataHandler(jsonData) ?? jsonData
    deepmerge(formData, jsonData, { clone: false })
    await persistCurrentConfig(formData)

    if (importedModelData != null) {
      const modelStore = useModel()
      const modelSnapshot = jsonClone(importedModelData)
      modelStore.modelData = modelSnapshot
      await counter.storageSet(confModelKey, modelSnapshot)
      ElMessage.success('导入成功（含AI模型），已自动保存')
      return
    }

    ElMessage.success('导入成功，已自动保存')
  }

  function confDelete() {
    deepmerge(formData, defaultFormData, { clone: false })
    logger.debug('formData已清空')
    ElMessage.success('配置清空成功, 不会自动保存, 请手动保存或重载恢复')
  }

  return {
    confInit: init,
    confSaving,
    confPersistNow,
    confReload,
    confExport,
    confImport,
    confDelete,
    formDataKey,
    defaultFormData,
    formData,
    isLoaded,
  }
})

window.__q_useConf = useConf
