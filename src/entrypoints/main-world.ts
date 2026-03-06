import { defineUnlistedScript } from '#imports'
import axios from 'axios'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from '@/App.vue'
import { getRootVue } from '@/composables/useVue'
import { loader } from '@/utils'
import { logger } from '@/utils/logger'

const LIST_PATHS = new Set([
  '/web/geek/job',
  '/web/geek/job-recommend',
  '/web/geek/jobs',
])
const NAVIGATION_EVENT = 'boss-helper:navigation'
const DETAIL_API_PATH = '/wapi/zpgeek/job/detail.json'
const DETAIL_CACHE_KEY = '__boss_helper_job_detail__'
let historyPatched = false
let networkPatched = false

function isDetailPayload(value: unknown): value is { zpData: bossZpDetailData } {
  if (!value || typeof value !== 'object') {
    return false
  }
  const data = value as Record<string, any>
  return Boolean(
    data.zpData?.securityId
    && data.zpData?.lid
    && data.zpData?.jobInfo?.encryptId,
  )
}

function cacheDetailPayload(payload: unknown) {
  if (isDetailPayload(payload)) {
    ;(window as typeof window & Record<string, unknown>)[DETAIL_CACHE_KEY] = payload.zpData
  }
}

function patchNetworkCapture() {
  if (networkPatched) {
    return
  }

  const originalFetch = window.fetch.bind(window)
  window.fetch = async (...args) => {
    const response = await originalFetch(...args)
    try {
      const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url
      if (requestUrl?.includes(DETAIL_API_PATH)) {
        response.clone().json().then(cacheDetailPayload).catch(() => {})
      }
    }
    catch {
    }
    return response
  }

  const originalOpen = XMLHttpRequest.prototype.open
  const originalSend = XMLHttpRequest.prototype.send

  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    ;(this as XMLHttpRequest & { __bossHelperUrl?: string }).__bossHelperUrl = typeof url === 'string' ? url : url.toString()
    return originalOpen.call(this, method, url, ...args)
  }

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('loadend', function () {
      const requestUrl = (this as XMLHttpRequest & { __bossHelperUrl?: string }).__bossHelperUrl
      if (!requestUrl?.includes(DETAIL_API_PATH) || typeof this.responseText !== 'string') {
        return
      }
      try {
        cacheDetailPayload(JSON.parse(this.responseText))
      }
      catch {
      }
    }, { once: true })
    return originalSend.apply(this, args)
  }

  networkPatched = true
}

function cleanupInjectedViews(path: string) {
  if (!path.startsWith('/job_detail/')) {
    document.getElementById('boss-helper-detail-action')?.remove()
  }
  if (!LIST_PATHS.has(path)) {
    document.getElementById('boss-helper-job-warp')?.remove()
    document.getElementById('boss-helper-job')?.remove()
  }
}

function patchHistoryEvents() {
  if (historyPatched) {
    return
  }

  const dispatchNavigation = () => {
    window.dispatchEvent(new Event(NAVIGATION_EVENT))
  }

  for (const key of ['pushState', 'replaceState'] as const) {
    const original = history[key]
    history[key] = function (...args) {
      const result = original.apply(this, args)
      dispatchNavigation()
      return result
    }
  }

  window.addEventListener('popstate', dispatchNavigation)
  historyPatched = true
}

async function main(router: any) {
  const path = router.path || window.location.pathname
  cleanupInjectedViews(path)
  let module = {
    run() {
      logger.info('BossHelper加载成功')
      logger.warn('当前页面无对应hook脚本', path)
    },
  }
  if (LIST_PATHS.has(path)) {
    module = await import('@/pages/zhipin')
  }
  else if (path.startsWith('/job_detail/')) {
    module = await import('@/pages/zhipin-detail')
  }
  module.run()
  const helper = document.querySelector('#boss-helper')
  if (!helper) {
    const app = createApp(App)
    app.use(createPinia())
    const appEl = document.createElement('div')
    appEl.id = 'boss-helper'
    document.body.append(appEl)
    app.mount(appEl)
  }
}

async function start() {
  patchHistoryEvents()
  patchNetworkCapture()
  window.addEventListener(NAVIGATION_EVENT, () => {
    void main({ path: window.location.pathname })
  })

  void main({ path: window.location.pathname })

//   document.documentElement.classList.toggle(
//     "dark",
//     GM_getValue("theme-dark", false)
//   );

  try {
    const v = await getRootVue()
    if (Array.isArray(v?.$router?.afterHooks)) {
      v.$router.afterHooks.push(main)
    }
    if (v?.$route?.path) {
      void main(v.$route)
    }
  }
  catch (error) {
    logger.warn('未找到Vue根组件，回退为基于URL的页面增强', error)
  }
  let axiosLoad: () => void
  axios.interceptors.request.use(
    (config) => {
      if (config.timeout != null) {
        axiosLoad = loader({ ms: config.timeout, color: '#F79E63' })
      }
      return config
    },
    async (error) => {
      axiosLoad()
      return Promise.reject(error)
    },
  )
  axios.interceptors.response.use(
    (response) => {
      axiosLoad()
      return response
    },
    async (error) => {
      axiosLoad()
      return Promise.reject(error)
    },
  )
}

export default defineUnlistedScript(() => {
  start().catch((e) => {
    logger.error(e)
  })
})
