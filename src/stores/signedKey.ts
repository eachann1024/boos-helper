import type { Middleware } from 'openapi-fetch'
import type { modelData } from '@/composables/useModel'
import type { components, paths } from '@/types/openapi'
import { ref, toRaw } from '#imports'
import { watchThrottled } from '@vueuse/core'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import createClient from 'openapi-fetch'
import { defineStore } from 'pinia'
import { watch } from 'vue'
import { useModel } from '@/composables/useModel'
import { counter } from '@/message'
import { useUser } from '@/stores/user'
import { jsonClone } from '@/utils/deepmerge'
import { logger } from '@/utils/logger'

type SignedKeyInfo = components['schemas']['KeyInfo']

export interface NetConf {
  version: string
  version_description?: string
  notification: (
    | NotificationAlert
    | NotificationMessage
    | NotificationNotification
  )[]
  store?: Record<string, [string, string, string]>
  price_info?: {
    signedKey: number
    account: number
    update_time: string
  }
  feedback: string
}

export interface NotificationAlert {
  key: string
  type: 'alert'
  data: import('element-plus').AlertProps
}

export interface NotificationMessage {
  key: string
  type: 'message'
  data: { title?: string, content: string, duration?: number }
}

export interface NotificationNotification {
  key: string
  type: 'notification'
  data: import('element-plus').NotificationProps & {
    url?: string
    duration?: number
  }
}

interface SignedModelCache {
  fetchedAt: string
  models: modelData[]
}

// logger.debug("import.meta.env",import.meta.env)

function sdbmCode(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = char + (hash << 6) + (hash << 16) - hash
  }
  return hash.toString()
}

export function signedKeyReqHandler(data: any, message = true): string | undefined {
  // logger.debug('请求响应', data)
  const { error } = data
  if (error != null) {
    let errMsg = '未知错误'
    if (error instanceof Error) {
      errMsg = error.message
    }
    else if (error instanceof Response) {
      errMsg = error.statusText
    }
    else if (typeof error === 'string') {
      errMsg = error
    }
    else if (error != null && typeof error === 'object') {
      if ('detail' in error) {
        errMsg = JSON.stringify(error.detail)
      }
      else if ('message' in error) {
        errMsg = JSON.stringify(error.message)
      }
    }
    if (message) {
      ElMessage.error(errMsg)
    }
    return errMsg
  }
}

export type Client = ReturnType<typeof createClient<paths>>
const baseUrl = (true || import.meta.env.PROD || import.meta.env.TEST || import.meta.env.WXT_TEST) ? 'https://boss-helper.eachann.dev' : 'http://localhost:8002'

export const useSignedKey = defineStore('signedKey', () => {
  const signedKey = ref<string | null>(null)
  const signedKeyBak = ref<string | null>(null)
  const signedKeyInfo = ref<SignedKeyInfo>()
  const signedKeyStorageKey = 'sync:signedKey'
  const signedKeyInfoStorageKey = 'sync:signedKeyInfo'
  const signedModelSyncError = ref('')
  const isSignedModelSyncing = ref(false)
  const user = useUser()
  const netConf = ref<NetConf>()
  let signedModelSyncPromise: Promise<void> | null = null

  const netNotificationMap = new Map<string, boolean>()

  const client = createClient<paths>({ baseUrl })

  function getResolvedToken(token?: string) {
    return token ?? signedKey.value ?? signedKeyBak.value ?? null
  }

  function getSignedModelCacheKey(token: string) {
    return `local:signed-model-cache:${sdbmCode(token)}`
  }

  function buildAuthHeaders(token?: string) {
    const resolvedToken = getResolvedToken(token)
    const headers: Record<string, string | undefined> = {}
    if (resolvedToken) {
      headers.Authorization = `Bearer ${resolvedToken}`
    }
    const uid = user.getUserId()
    if (uid != null) {
      headers.BossHelperUserID = uid.toString()
    }
    return headers
  }

  function applySignedKeyState(token: string, info?: SignedKeyInfo) {
    signedKeyBak.value = token
    const userId = user.getUserId()?.toString()
    if (userId == null) {
      return
    }
    const matchedUser = info?.users?.find(item => item.user_id === userId)
    signedKey.value = matchedUser ? token : null
  }

  async function restoreSignedModelCache(token: string) {
    const cache = await counter.storageGet<SignedModelCache>(getSignedModelCacheKey(token))
    if (cache?.models?.length) {
      useModel().mergeModelData(cache.models)
    }
  }

  async function persistSignedModelCache(token: string, models: modelData[]) {
    await counter.storageSet<SignedModelCache>(getSignedModelCacheKey(token), {
      fetchedAt: new Date().toISOString(),
      models: jsonClone(models),
    })
  }

  async function syncSignedModels(token?: string) {
    const resolvedToken = getResolvedToken(token)
    if (resolvedToken == null) {
      return false
    }
    const resp = await client.GET('/v1/llm/model_list', {
      headers: buildAuthHeaders(resolvedToken),
    })
    const errMsg = signedKeyReqHandler(resp, false)
    if (errMsg != null) {
      throw new Error(errMsg)
    }
    const models = (resp.data as modelData[] | undefined) ?? []
    useModel().mergeModelData(models)
    await persistSignedModelCache(resolvedToken, models)
    return true
  }

  async function syncNetConf() {
    try {
      const { data } = await client.GET('/config')
      netConf.value = data as NetConf
      window.__q_netConf = () => netConf.value
      const now = new Date().getTime()
      await Promise.all(netConf.value?.notification.map(async item => netNotification(item, now)) ?? [])
    }
    catch (error) {
      logger.warn('刷新在线配置失败', error)
    }
  }

  const authMiddleware: Middleware = {
    async onRequest({ request }) {
      if (request.headers.get('Authorization') == null) {
        request.headers.set('Authorization', `Bearer ${signedKey.value}`)
      }
      if (request.headers.get('BossHelperUserID') == null) {
        const uid = user.getUserId()
        if (uid != null) {
          request.headers.set('BossHelperUserID', uid.toString())
        }
      }
      return request
    },
  }

  client.use(authMiddleware)

  watch(signedKey, (v) => {
    if (v == null || v === '') {
      return
    }
    void counter.storageSet(signedKeyStorageKey, v).catch((e) => {
      logger.error('保存密钥失败', e)
      ElMessage.error('保存密钥失败')
    })
  })

  watchThrottled(signedKeyInfo, (v) => {
    if (v == null) {
      return
    }
    void counter.storageSet(signedKeyInfoStorageKey, toRaw(v)).catch((e) => {
      logger.error('保存密钥信息失败', e)
      ElMessage.error('保存密钥信息失败')
    })
  }, { throttle: 2000 })

  async function netNotification(item:
  | NotificationAlert
  | NotificationMessage
  | NotificationNotification, now: number = 0) {
    if (now !== 0 && now < await counter.storageGet(`local:netConf-${item.key}`, 0)) {
      return
    }
    if (netNotificationMap.has(item.key)) {
      return
    }
    netNotificationMap.set(item.key, true)
    if (item.type === 'message') {
      void ElMessageBox.alert(item.data.content, item.data.title ?? 'message', {
        ...item.data,
        confirmButtonText: 'OK',
        callback: () => {
          void counter.storageSet(
            `local:netConf-${item.key}`,
            now + (item.data.duration ?? 86400) * 1000,
          )
        },
      })
    }
    else if (item.type === 'notification') {
      void ElNotification({
        ...item.data,
        duration: 0,
        onClose() {
          void counter.storageSet(
            `local:netConf-${item.key}`,
            now + (item.data.duration ?? 86400) * 1000,
          )
        },
        onClick() {
          item.data.url ?? window.open(item.data.url)
        },
      })
    }
  }

  async function getSignedKeyInfo(token?: string) {
    const resp = await client.GET('/v1/key/info', {
      headers: buildAuthHeaders(token),
    })
    const errMsg = signedKeyReqHandler(resp, false)
    if (errMsg != null) {
      throw new Error(errMsg)
    }
    return resp.data
  }

  async function refreshSignedKeyInfo(token?: string) {
    void syncNetConf()
    const resolvedToken = getResolvedToken(token)
    if (resolvedToken == null) {
      return false
    }
    try {
      await syncSignedModels(resolvedToken)
      const data = await getSignedKeyInfo(resolvedToken)
      signedKeyInfo.value = data
      applySignedKeyState(resolvedToken, data)
      signedModelSyncError.value = ''
      return true
    }
    catch (error) {
      logger.error('刷新在线模型失败', error)
      return false
    }
  }

  async function ensureSignedModelsReady(timeoutMs = 5000) {
    const resolvedToken = getResolvedToken()
    if (resolvedToken == null) {
      return
    }
    if (signedModelSyncPromise == null) {
      signedModelSyncError.value = ''
      isSignedModelSyncing.value = true
      signedModelSyncPromise = refreshSignedKeyInfo(resolvedToken)
        .then((ok) => {
          if (!ok) {
            signedModelSyncError.value = '在线模型同步失败，请稍后重试'
          }
        })
        .finally(() => {
          isSignedModelSyncing.value = false
          signedModelSyncPromise = null
        })
    }

    if (timeoutMs <= 0) {
      await signedModelSyncPromise
      return
    }

    let timedOut = false
    await Promise.race([
      signedModelSyncPromise,
      new Promise<void>((resolve) => {
        setTimeout(() => {
          timedOut = true
          resolve()
        }, timeoutMs)
      }),
    ])

    if (timedOut && isSignedModelSyncing.value) {
      signedModelSyncError.value = '在线模型同步失败，请稍后重试'
      isSignedModelSyncing.value = false
    }
  }

  async function initSignedKey() {
    const key = await counter.storageGet<string>(signedKeyStorageKey)
    if (key == null) {
      return false
    }
    signedKeyBak.value = key
    const info = await counter.storageGet<SignedKeyInfo>(signedKeyInfoStorageKey)
    if (info != null) {
      signedKeyInfo.value = info
      applySignedKeyState(key, info)
    }
    await restoreSignedModelCache(key)
    void ensureSignedModelsReady().catch((error) => {
      logger.error('后台同步在线模型失败', error)
    })
    return true
  }

  async function updateResume() {
    const resume = await user.getUserResumeData(true)
    const code = sdbmCode(JSON.stringify(resume))
    let resp = await client.POST('/v1/key/resume', {
      body: {
        code,
      },
    })
    let errMsg = signedKeyReqHandler(resp)
    if (errMsg != null) {
      return
    }
    resp = await client.POST('/v1/key/resume', {
      body: {
        code,
        data: resume as any,
      },
    })
    errMsg = signedKeyReqHandler(resp)
    if (errMsg == null) {
      ElMessage.success('更新简历成功')
    }
  }

  return {
    signedKey,
    signedKeyBak,
    client,
    netConf,
    isSignedModelSyncing,
    signedModelSyncError,
    signedKeyReqHandler,
    initSignedKey,
    ensureSignedModelsReady,
    sdbmCode,
    updateResume,
    getSignedKeyInfo,
    refreshSignedKeyInfo,
    signedKeyInfo,
    netNotification,
  }
})

window.__q_useSignedKey = useSignedKey
