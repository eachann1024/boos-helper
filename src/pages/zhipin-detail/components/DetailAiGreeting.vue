<script lang="ts" setup>
import type { MyJobListData } from '@/stores/jobs'
import type { logData } from '@/stores/log'
import { ElButton, ElMessage, ElTooltip } from 'element-plus'
import { computed, h, onMounted, ref } from 'vue'
import { getAiGreetingModelIssue, prepareAiGreeting, sendGreetingByContent } from '@/composables/useApplying/greeting'
import { requestDetail, sendPublishReq } from '@/composables/useApplying/utils'
import { useModel } from '@/composables/useModel'
import { getAvailableMessageSenders } from '@/composables/useWebSocket'
import { useConf } from '@/stores/conf'
import { normalizeDetailToCard, normalizeDetailToJobItem } from '@/stores/jobs'
import { useSignedKey } from '@/stores/signedKey'
import { useUser } from '@/stores/user'
import { logger } from '@/utils/logger'

const DETAIL_SELECTORS = [
  '#wrap .page-job-wrapper',
  '.page-job-wrapper',
  '.job-detail-container',
  '.job-detail-box',
  '.job-detail',
  '[class*="job-detail"]',
]
const DETAIL_DISCOVERY_TIMEOUT = 20000
const DETAIL_CACHE_KEY = '__boss_helper_job_detail__'

const conf = useConf()
const model = useModel()
const signedKey = useSignedKey()
const user = useUser()

const loading = ref(false)
const detail = ref<bossZpDetailData>()
const detailStatus = ref('等待职位详情数据')
const lastSendChannel = ref('')
const lastSendAttemptMessage = ref('')
const lastSendOutcome = ref<'idle' | 'copied_no_channel' | 'attempted' | 'failed' | 'copied_native'>('idle')
const lastCopiedToClipboard = ref(false)
const activeAction = ref<'send' | 'copy' | null>(null)

function LightningIcon() {
  return h(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
    },
    [
      h('path', {
        d: 'M13 2L5 13H11L10 22L19 10H13L13 2Z',
        fill: 'currentColor',
      }),
    ],
  )
}

function CopyDocumentIcon() {
  return h(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      xmlns: 'http://www.w3.org/2000/svg',
    },
    [
      h('path', {
        d: 'M9 7C9 5.89543 9.89543 5 11 5H18C19.1046 5 20 5.89543 20 7V18C20 19.1046 19.1046 20 18 20H11C9.89543 20 9 19.1046 9 18V7Z',
        fill: 'currentColor',
        opacity: '0.9',
      }),
      h('path', {
        d: 'M6 4C4.89543 4 4 4.89543 4 6V15C4 16.1046 4.89543 17 6 17H7V15H6V6H15V4H6Z',
        fill: 'currentColor',
        opacity: '0.55',
      }),
    ],
  )
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function copyGreetingToClipboard(content: string) {
  try {
    await navigator.clipboard.writeText(content)
    return true
  }
  catch (error) {
    logger.warn('详情页复制 AI 招呼语失败', error)
    return false
  }
}

function getSocketReadyStateLabel() {
  switch (window.socket?.readyState) {
    case WebSocket.CONNECTING:
      return '0(CONNECTING)'
    case WebSocket.OPEN:
      return '1(OPEN)'
    case WebSocket.CLOSING:
      return '2(CLOSING)'
    case WebSocket.CLOSED:
      return '3(CLOSED)'
    default:
      return 'N/A'
  }
}

function isVisibleElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false
  }
  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

function collectChannelDiagnostics(copiedToClipboard = lastCopiedToClipboard.value) {
  const senders = getAvailableMessageSenders()
  return {
    detailLoaded: Boolean(detail.value),
    senderAvailable: senders.length > 0,
    senderName: senders[0]?.label ?? '',
    senderNames: senders.map(sender => sender.label),
    socketReadyState: window.socket?.readyState ?? null,
    copiedToClipboard,
  }
}

function findNativeGreetingButton() {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('button, a, [role="button"]'))
  return candidates.find((element) => {
    if (!isVisibleElement(element)) {
      return false
    }
    const text = element.textContent?.trim()
    return text === '打招呼' || text === '继续沟通'
  })
}

function triggerNativeGreetingFlow() {
  const button = findNativeGreetingButton()
  if (!button) {
    return false
  }
  button.dispatchEvent(new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window,
  }))
  logger.info('详情页复制模式触发原生沟通按钮', {
    text: button.textContent?.trim(),
    tag: button.tagName,
    className: button.className,
  })
  return true
}

function isDetailData(value: unknown): value is bossZpDetailData {
  if (!value || typeof value !== 'object') {
    return false
  }
  const data = value as Record<string, any>
  return Boolean(
    data.securityId
    && data.lid
    && data.jobInfo?.encryptId
    && data.jobInfo?.encryptUserId
    && data.bossInfo?.name
    && data.brandComInfo?.brandName,
  )
}

function tryBindJobDetailFromVue() {
  for (const selector of DETAIL_SELECTORS) {
    const host = document.querySelector<any>(selector)
    const jobVue = host?.__vue__
    if (!jobVue || !isDetailData(jobVue.jobDetail)) {
      continue
    }

    detail.value = jobVue.jobDetail
    detailStatus.value = `已通过页面状态读取 (${selector})`

    const ownDescriptor = Object.getOwnPropertyDescriptor(jobVue, 'jobDetail')
    const protoDescriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(jobVue) ?? {},
      'jobDetail',
    )
    const originalSet = ownDescriptor?.set ?? protoDescriptor?.set
    if (!originalSet || Object.prototype.hasOwnProperty.call(jobVue, '__bossHelperJobDetailHooked')) {
      return true
    }

    Object.defineProperty(jobVue, '__bossHelperJobDetailHooked', {
      value: true,
      configurable: true,
    })
    Object.defineProperty(jobVue, 'jobDetail', {
      configurable: true,
      enumerable: true,
      get() {
        return detail.value
      },
      set(val: bossZpDetailData) {
        detail.value = val
        originalSet.call(this, val)
      },
    })
    return true
  }
  return false
}

function findDetailDataInObject(source: unknown, maxNodes = 2000): bossZpDetailData | null {
  if (!source || (typeof source !== 'object' && typeof source !== 'function')) {
    return null
  }

  const queue: unknown[] = [source]
  const visited = new WeakSet<object>()
  let count = 0

  while (queue.length && count < maxNodes) {
    const current = queue.shift()
    if (!current || (typeof current !== 'object' && typeof current !== 'function')) {
      continue
    }
    if (visited.has(current as object)) {
      continue
    }
    visited.add(current as object)
    count += 1

    if (isDetailData(current)) {
      return current
    }

    const record = current as Record<string, unknown>
    let directCandidate: unknown
    try {
      directCandidate = record.jobDetail ?? record.zpData ?? record.data
    }
    catch {
      continue
    }
    if (isDetailData(directCandidate)) {
      return directCandidate
    }

    let values: unknown[]
    try {
      values = Object.values(record)
    }
    catch {
      continue
    }

    for (const value of values) {
      if (value && (typeof value === 'object' || typeof value === 'function')) {
        queue.push(value)
      }
    }
  }

  return null
}

function queryText(selectors: string[]) {
  for (const selector of selectors) {
    const text = document.querySelector(selector)?.textContent?.trim()
    if (text) {
      return text
    }
  }
  return ''
}

function queryAttr(selectors: string[], attr: string) {
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.getAttribute(attr)?.trim()
    if (value) {
      return value
    }
  }
  return ''
}

function extractFromScripts(patterns: RegExp[]) {
  const scripts = Array.from(document.scripts)
    .filter(script => !script.src)
    .map(script => script.textContent ?? '')
    .join('\n')

  for (const pattern of patterns) {
    const matched = scripts.match(pattern)?.[1]
    if (matched) {
      return matched
    }
  }
  return ''
}

function extractFromHtml(patterns: RegExp[]) {
  const html = document.documentElement?.outerHTML ?? ''
  for (const pattern of patterns) {
    const matched = html.match(pattern)?.[1]
    if (matched) {
      return matched
    }
  }
  return ''
}

function extractFromElementAttributes(selectors: string[], patterns: RegExp[]) {
  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll(selector))
    for (const node of nodes) {
      for (const attr of Array.from(node.attributes)) {
        for (const pattern of patterns) {
          const matched = attr.value.match(pattern)?.[1]
          if (matched) {
            return matched
          }
        }
      }
    }
  }
  return ''
}

async function tryInitJobDetailFromDom() {
  const jobName = queryText(['#main .job-primary .name h1', '.job-banner .job-primary h1'])
  const description = queryText(['.job-detail-section .job-sec-text', '.job-detail .job-sec-text'])
  const bossNameRaw = queryText(['.job-boss-info .name', '.job-detail .job-boss-info .name'])
  const bossName = bossNameRaw.replace(/在线/g, '').trim()
  const bossInfoAttr = queryText(['.job-boss-info .boss-info-attr'])
  const [brandName = '', bossTitle = ''] = bossInfoAttr.split('·').map(item => item.trim())
  const salaryDesc = queryText(['#main .job-primary .salary', '.job-primary .job-salary'])
  const securityId = new URLSearchParams(window.location.search).get('securityId') ?? ''
  const encryptId = window.location.pathname.match(/\/job_detail\/([^./?]+)\.html/)?.[1] ?? ''
  const encryptUserId = extractFromElementAttributes(
    ['a', 'button', '[data-url]', '[href]', '[onclick]', '[data-lid]', '[data-jobid]', '[data-bossid]'],
    [
      /encryptUserId=([^"'&]+)/,
      /encryptUserId[:=]["']?([^"'&,\s}]+)/,
      /bossId=([^"'&]+)/,
    ],
  ) || extractFromScripts([
    /"encryptUserId":"([^"]+)"/,
    /encryptUserId:'([^']+)'/,
    /encryptUserId:"([^"]+)"/,
    /encryptUserId\\?"?:\\?"?([^"\\]+)\\?"?/,
    /bossId":"([^"]+)"/,
  ]) || extractFromHtml([
    /encryptUserId=([^"'&]+)/,
    /encryptUserId[:=]["']?([^"'&,\s}]+)/,
    /bossId[:=]["']?([^"'&,\s}]+)/,
  ])
  const lid = extractFromElementAttributes(
    ['a', 'button', '[data-url]', '[href]', '[onclick]', '[data-lid]'],
    [
      /(?:\?|&)lid=([^"'&]+)/,
      /lid[:=]["']?([^"'&,\s}]+)/,
    ],
  ) || extractFromScripts([
    /"lid":"([^"]+)"/,
    /lid:'([^']+)'/,
    /lid:"([^"]+)"/,
    /lid\\?"?:\\?"?([^"\\]+)\\?"?/,
  ]) || extractFromHtml([
    /(?:\?|&)lid=([^"'&]+)/,
    /lid[:=]["']?([^"'&,\s}]+)/,
  ])
  const sessionId = extractFromScripts([
    /"sessionId":"([^"]+)"/,
    /sessionId:'([^']+)'/,
    /sessionId:"([^"]+)"/,
    /sessionId\\?"?:\\?"?([^"\\]+)\\?"?/,
  ])
  const encryptBrandId = extractFromScripts([
    /"encryptBrandId":"([^"]+)"/,
    /encryptBrandId:'([^']+)'/,
    /encryptBrandId:"([^"]+)"/,
    /encryptBrandId\\?"?:\\?"?([^"\\]+)\\?"?/,
  ])
  const address = queryText(['.location-address', '.job-location', '.job-address'])
  const bossAvatar = queryAttr(['.job-boss-info img', '.job-detail .job-boss-info img'], 'src')
  const statusText = queryText(['.job-status span'])
  const tags = Array.from(document.querySelectorAll('.job-labels li, .job-tags li, .info-labels span'))
    .map(el => el.textContent?.trim() ?? '')
    .filter(Boolean)

  if (!jobName || !description || !bossName || !brandName || !securityId || !encryptId) {
    return false
  }

  if (!lid) {
    detailStatus.value = 'DOM 已解析，但缺少 lid'
    return false
  }

  let resolvedDetail: bossZpDetailData | null = null
  if (!encryptUserId) {
    detailStatus.value = 'DOM 已解析，正在通过详情接口补全 encryptUserId'
    try {
      const response = await requestDetail({ securityId, lid })
      if (response.data.code === 0 && isDetailData(response.data.zpData)) {
        resolvedDetail = response.data.zpData
      }
      else {
        detailStatus.value = `详情接口补全失败: ${response.data.message || '返回数据无效'}`
        return false
      }
    }
    catch (error) {
      detailStatus.value = `详情接口补全失败: ${error instanceof Error ? error.message : String(error)}`
      return false
    }
  }

  if (resolvedDetail) {
    detail.value = resolvedDetail
    detailStatus.value = '已通过详情页 DOM + 详情接口读取'
    return true
  }

  detail.value = {
    pageType: 0,
    selfAccess: false,
    securityId,
    sessionId,
    lid,
    jobInfo: {
      encryptId,
      encryptUserId,
      invalidStatus: false,
      jobName,
      position: 0,
      positionName: jobName,
      location: 0,
      locationName: '',
      locationUrl: '',
      experienceName: '',
      degreeName: '',
      jobType: 0,
      proxyJob: 0,
      proxyType: 0,
      salaryDesc,
      payTypeDesc: null,
      postDescription: description,
      encryptAddressId: '',
      address,
      longitude: 0,
      latitude: 0,
      staticMapUrl: '',
      pcStaticMapUrl: '',
      baiduStaticMapUrl: '',
      baiduPcStaticMapUrl: '',
      overseasAddressList: [],
      overseasInfo: null,
      showSkills: tags,
      anonymous: 0,
      jobStatusDesc: statusText,
    },
    bossInfo: {
      name: bossName,
      title: bossTitle,
      tiny: bossAvatar,
      large: bossAvatar,
      activeTimeDesc: '',
      bossOnline: document.querySelector('.boss-online-tag') != null,
      brandName,
      bossSource: 0,
      certificated: document.querySelector('.job-boss-info .icon-vip') != null,
      tagIconUrl: null,
      avatarStickerUrl: null,
    },
    brandComInfo: {
      encryptBrandId,
      brandName,
      logo: '',
      stage: 0,
      stageName: '',
      scale: 0,
      scaleName: '',
      industry: 0,
      industryName: '',
      introduce: '',
      labels: [],
      activeTime: Date.now(),
      visibleBrandInfo: true,
      focusBrand: false,
      customerBrandName: brandName,
      customerBrandStageName: '',
    },
    oneKeyResumeInfo: {
      inviteType: 0,
      alreadySend: false,
      canSendResume: false,
      canSendPhone: false,
      canSendWechat: false,
    },
    relationInfo: {
      interestJob: false,
      beFriend: false,
    },
    handicappedInfo: null,
    appendixInfo: {
      canFeedback: false,
      chatBubble: null,
    },
    atsOnlineApplyInfo: {
      inviteType: 0,
      alreadyApply: false,
    },
    certMaterials: [],
  }
  detailStatus.value = '已通过详情页 DOM 读取'
  return true
}

function tryInitJobDetailFromWindow() {
  const cachedDetail = (window as typeof window & Record<string, unknown>)[DETAIL_CACHE_KEY]
  if (isDetailData(cachedDetail)) {
    detail.value = cachedDetail
    detailStatus.value = '已通过详情接口缓存读取'
    return true
  }

  const candidates: Array<[string, unknown]> = [
    ['__INITIAL_STATE__', (window as any).__INITIAL_STATE__],
    ['__NUXT__', (window as any).__NUXT__],
    ['__NEXT_DATA__', (window as any).__NEXT_DATA__],
    ['__zp_statis__', (window as any).__zp_statis__],
    ['window', window],
  ]

  for (const [label, candidate] of candidates) {
    const matched = findDetailDataInObject(candidate)
    if (matched) {
      detail.value = matched
      detailStatus.value = `已通过全局对象读取 (${label})`
      return true
    }
  }

  detailStatus.value = '等待详情接口或页面状态数据'
  return false
}

async function initJobDetail() {
  detailStatus.value = '正在解析职位详情数据'
  const endAt = Date.now() + DETAIL_DISCOVERY_TIMEOUT
  while (Date.now() < endAt) {
    if (tryBindJobDetailFromVue() || tryInitJobDetailFromWindow() || await tryInitJobDetailFromDom()) {
      return
    }
    await sleep(250)
  }
  detailStatus.value = '20 秒内未读取到职位详情数据'
  throw new Error('未读取到职位详情数据')
}

const disabledReason = computed(() => {
  if (loading.value) {
    return ''
  }
  if (!conf.isLoaded) {
    return '正在加载配置'
  }
  if (!model.isModelLoaded) {
    return '正在加载本地模型'
  }
  if (!conf.formData.aiGreeting.enable) {
    return '请先在配置中开启 AI 打招呼'
  }
  if (!detail.value) {
    return detailStatus.value
  }
  const modelIssue = getAiGreetingModelIssue()
  if (modelIssue) {
    return modelIssue
  }
  return ''
})

const channelDiagnostics = computed(() => collectChannelDiagnostics())
const canDirectSend = computed(() => Boolean(detail.value) && !disabledReason.value && channelDiagnostics.value.senderAvailable)
const canCopyGuide = computed(() => Boolean(detail.value) && !disabledReason.value)

const sendTooltipText = computed(() => {
  if (disabledReason.value) {
    return disabledReason.value
  }
  const senderNames = channelDiagnostics.value.senderNames.join('/') || '无'
  return `直接发送 | sender:${senderNames} | socket:${getSocketReadyStateLabel()}`
})

const copyTooltipText = computed(() => {
  if (disabledReason.value) {
    return disabledReason.value
  }
  const senderNames = channelDiagnostics.value.senderNames.join('/') || '无'
  return `生成并复制，然后继续执行页面原生打招呼/继续沟通 | sender:${senderNames} | socket:${getSocketReadyStateLabel()}`
})

function createDetailListData(data: bossZpDetailData): MyJobListData {
  const card = normalizeDetailToCard(data)
  return {
    ...normalizeDetailToJobItem(data),
    card,
    status: {
      status: 'pending',
      msg: '',
      setStatus: (_status, _msg) => {},
    },
    getCard: async () => card,
  }
}

async function handleSend(action: 'send' | 'copy') {
  if (loading.value || activeAction.value != null) {
    return
  }
  if (disabledReason.value) {
    ElMessage.warning(disabledReason.value)
    return
  }
  if (!detail.value) {
    return
  }

  activeAction.value = action
  loading.value = true
  detailStatus.value = action === 'send' ? '正在生成并发送 AI 招呼语' : '正在生成并复制 AI 招呼语'
  lastSendOutcome.value = 'idle'
  lastSendChannel.value = ''
  lastSendAttemptMessage.value = ''
  lastCopiedToClipboard.value = false
  let copiedToClipboard = false
  try {
    const listData = createDetailListData(detail.value)
    const ctx: logData = { listData }

    const generatedContent = await prepareAiGreeting(ctx)
    copiedToClipboard = await copyGreetingToClipboard(generatedContent)
    lastCopiedToClipboard.value = copiedToClipboard

    if (action === 'copy') {
      const triggered = triggerNativeGreetingFlow()
      lastSendOutcome.value = 'copied_native'
      detailStatus.value = copiedToClipboard
        ? (triggered ? 'AI 招呼语已复制，并已继续执行页面沟通' : 'AI 招呼语已复制')
        : (triggered ? '已继续执行页面沟通' : '复制失败')
      ElMessage.warning(
        copiedToClipboard
          ? (triggered ? '内容已复制，并已继续执行页面的打招呼/继续沟通' : '内容已复制，但未找到页面上的打招呼/继续沟通按钮')
          : (triggered ? '复制失败，但已继续执行页面的打招呼/继续沟通' : '复制失败，且未找到页面上的打招呼/继续沟通按钮'),
      )
      return
    }

    const diagnosticsBeforeSend = collectChannelDiagnostics(copiedToClipboard)
    if (!diagnosticsBeforeSend.senderAvailable) {
      lastSendOutcome.value = 'copied_no_channel'
      detailStatus.value = copiedToClipboard
        ? 'AI 招呼语已复制，聊天通道未就绪'
        : '聊天通道未就绪'
      logger.warn('详情页聊天通道未就绪，未触发页面跳转', diagnosticsBeforeSend)
      ElMessage.warning(
        copiedToClipboard
          ? '聊天通道未就绪，内容已复制，请手动打开聊天窗口后重试'
          : '聊天通道未就绪，请手动打开聊天窗口后重试',
      )
      return
    }

    const hasRelation = Boolean(detail.value.relationInfo?.beFriend || detail.value.oneKeyResumeInfo?.alreadySend)
    let publishError: unknown

    if (!hasRelation) {
      try {
        await sendPublishReq(listData)
      }
      catch (error) {
        publishError = error
      }
    }

    detailStatus.value = '正在检查聊天通道'
    try {
      const result = await sendGreetingByContent(ctx, ctx.aiGreetingPrepared ?? '', true, {
        waitForChannelMs: 0,
      })
      lastSendChannel.value = result.channel ?? ''
      lastSendAttemptMessage.value = result.message
    }
    catch (error) {
      throw publishError ?? error
    }

    lastSendOutcome.value = 'attempted'
    detailStatus.value = copiedToClipboard
      ? 'AI 招呼语已复制，并已尝试发送'
      : 'AI 招呼语已生成，并已尝试发送'
    logger.info('详情页 AI 招呼语已尝试发送', {
      ...collectChannelDiagnostics(copiedToClipboard),
      senderName: lastSendChannel.value,
      lastSendAttemptMessage: lastSendAttemptMessage.value,
    })
    ElMessage.warning(
      copiedToClipboard
        ? '已复制，并已尝试发送，请以聊天窗口实际结果为准'
        : '已尝试发送，请以聊天窗口实际结果为准',
    )
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    lastSendOutcome.value = 'failed'
    detailStatus.value = copiedToClipboard
      ? `发送失败（内容已复制）: ${message}`
      : `发送失败: ${message}`
    logger.error('详情页 AI 定向打招呼失败', {
      error,
      diagnostics: collectChannelDiagnostics(copiedToClipboard),
      lastSendChannel: lastSendChannel.value,
    })
    ElMessage.error(
      copiedToClipboard
        ? `AI 定向发送失败，但招呼语已复制到剪贴板: ${message}`
        : `AI 定向发送失败: ${message}`,
    )
  }
  finally {
    loading.value = false
    activeAction.value = null
  }
}

onMounted(async () => {
  try {
    await Promise.all([
      (async () => {
        await conf.confInit()
        await model.initModel()
        await signedKey.initSignedKey()
      })(),
      initJobDetail(),
    ])
  }
  catch (error) {
    detailStatus.value = `初始化失败: ${error instanceof Error ? error.message : String(error)}`
    logger.error('详情页 AI 按钮初始化失败', error)
    ElMessage.error(`详情页初始化失败: ${error instanceof Error ? error.message : String(error)}`)
  }

  void user.initUser()
    .then(() => signedKey.refreshSignedKeyInfo())
    .catch((error) => {
      logger.warn('详情页后台刷新用户或在线模型失败', error)
    })
})
</script>

<template>
  <div class="boss-helper-detail-action">
    <ElTooltip v-if="canDirectSend" :content="sendTooltipText" placement="left">
      <ElButton
        class="boss-helper-detail-action__button"
        type="primary"
        circle
        :icon="LightningIcon"
        :loading="activeAction === 'send'"
        :disabled="Boolean(disabledReason)"
        @click="handleSend('send')"
      />
    </ElTooltip>
    <ElTooltip v-if="canCopyGuide || disabledReason" :content="copyTooltipText" placement="left">
      <ElButton
        class="boss-helper-detail-action__button boss-helper-detail-action__button--copy"
        circle
        :icon="CopyDocumentIcon"
        :loading="activeAction === 'copy'"
        :disabled="Boolean(disabledReason)"
        @click="handleSend('copy')"
      />
    </ElTooltip>
  </div>
</template>

<style lang="scss" scoped>
.boss-helper-detail-action {
  position: fixed;
  right: 28px;
  bottom: 150px;
  z-index: 2147483647;
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: 10px;
}

.boss-helper-detail-action__button {
  width: 52px;
  height: 52px;
  border: none;
  background: linear-gradient(135deg, #12b7b4, #118caa);
  box-shadow: 0 18px 40px rgb(18 183 180 / 26%);
  backdrop-filter: blur(12px);
}

.boss-helper-detail-action__button--copy {
  background: linear-gradient(135deg, #e9f4ff, #cfe5ff);
  color: #1560b8;
  box-shadow: 0 18px 40px rgb(21 96 184 / 18%);
}

@media (max-width: 768px) {
  .boss-helper-detail-action {
    right: 18px;
    bottom: 118px;
  }

  .boss-helper-detail-action__button {
    width: 48px;
    height: 48px;
  }
}
</style>
