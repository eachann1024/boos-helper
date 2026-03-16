<script lang="ts" setup>
import type { MyJobListData } from '@/stores/jobs'
import type { logData } from '@/stores/log'
import { ElButton, ElMessage } from 'element-plus'
import { ref } from 'vue'
import { getAiGreetingModelIssue, prepareAiGreeting } from '@/composables/useApplying/greeting'
import { requestDetail } from '@/composables/useApplying/utils'
import { useModel } from '@/composables/useModel'
import { useConf } from '@/stores/conf'
import { normalizeDetailToCard, normalizeDetailToJobItem } from '@/stores/jobs'
import { useSignedKey } from '@/stores/signedKey'
import { logger } from '@/utils/logger'

const DETAIL_CACHE_KEY = '__boss_helper_job_detail__'
const DETAIL_SELECTORS = [
  '#wrap .page-job-wrapper',
  '.page-job-wrapper',
  '.job-detail-container',
  '.job-detail-box',
  '.job-detail',
]

const conf = useConf()
const model = useModel()
const signedKey = useSignedKey()

const loading = ref(false)
const detail = ref<bossZpDetailData>()
let detailPromise: Promise<bossZpDetailData> | null = null
let initPromise: Promise<void> | null = null

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

function readDetailFromCache() {
  const cached = (window as typeof window & Record<string, unknown>)[DETAIL_CACHE_KEY]
  return isDetailData(cached) ? cached : null
}

function readDetailFromVue() {
  for (const selector of DETAIL_SELECTORS) {
    const jobVue = document.querySelector<any>(selector)?.__vue__
    if (isDetailData(jobVue?.jobDetail)) {
      return jobVue.jobDetail
    }
  }
  return null
}

function readDetailFromGlobals() {
  const candidates = [
    (window as any).__INITIAL_STATE__,
    (window as any).__INITIAL_STATE__?.zpData,
    (window as any).__INITIAL_STATE__?.data,
    (window as any).__INITIAL_STATE__?.jobDetail,
    (window as any).__NUXT__?.data,
    (window as any).__NEXT_DATA__?.props?.pageProps,
    (window as any).__zp_statis__,
  ]

  for (const candidate of candidates) {
    if (isDetailData(candidate)) {
      return candidate
    }
    if (isDetailData((candidate as any)?.zpData)) {
      return (candidate as any).zpData
    }
    if (isDetailData((candidate as any)?.data)) {
      return (candidate as any).data
    }
    if (isDetailData((candidate as any)?.jobDetail)) {
      return (candidate as any).jobDetail
    }
  }

  return null
}

function queryFirstAttr(selectors: string[], attr: string) {
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.getAttribute(attr)?.trim()
    if (value) {
      return value
    }
  }
  return ''
}

function queryFirstText(selectors: string[]) {
  for (const selector of selectors) {
    const text = document.querySelector(selector)?.textContent?.trim()
    if (text) {
      return text
    }
  }
  return ''
}

function extractFromInlineScripts(patterns: RegExp[]) {
  const scriptText = Array.from(document.scripts)
    .filter(script => !script.src)
    .map(script => script.textContent ?? '')
    .join('\n')

  for (const pattern of patterns) {
    const matched = scriptText.match(pattern)?.[1]
    if (matched) {
      return matched
    }
  }

  return ''
}

function readDetailRequestParams() {
  const securityId = new URLSearchParams(window.location.search).get('securityId') ?? ''
  const lidFromAttrs = queryFirstAttr(
    ['[data-lid]', 'a[href*="lid="]', '[data-url*="lid="]', '[onclick*="lid"]'],
    'data-lid',
  )

  const lidFromLinks = queryFirstAttr(['a[href*="lid="]'], 'href')
  const lidFromDataUrl = queryFirstAttr(['[data-url*="lid="]'], 'data-url')
  const lidFromOnclick = queryFirstAttr(['[onclick*="lid"]'], 'onclick')

  const readByPattern = (source: string) => {
    return source.match(/[?&"']lid=([^"'&]+)/)?.[1]
      ?? source.match(/lid[:=]["']?([^"'&,\s}]+)/)?.[1]
      ?? ''
  }

  const lid = lidFromAttrs
    || readByPattern(lidFromLinks)
    || readByPattern(lidFromDataUrl)
    || readByPattern(lidFromOnclick)
    || extractFromInlineScripts([
      /"lid":"([^"]+)"/,
      /lid:'([^']+)'/,
      /lid:"([^"]+)"/,
    ])

  return { securityId, lid }
}

function buildDetailFromDom() {
  const { securityId: requestSecurityId, lid } = readDetailRequestParams()
  const jobName = queryFirstText(['.smallbanner .job-title', '.job-title', '.job-primary .name h1'])
  const salaryDesc = queryFirstText(['.smallbanner .badge', '.job-primary .salary', '.job-salary'])
  const description = queryFirstText(['.job-sec-text'])
  const bossName = queryFirstText(['.job-boss-info .name']).replace(/刚刚活跃|在线/g, '').trim()
  const bossTitleRaw = queryFirstText(['.job-boss-info .boss-info-attr'])
  const [brandName = '', bossTitle = ''] = bossTitleRaw
    .split(/·|•/)
    .map(item => item.trim())
    .filter(Boolean)

  const jobActionUrl = queryFirstAttr(['.btn-startchat'], 'redirect-url')
    || queryFirstAttr(['.btn-startchat'], 'data-url')
    || queryFirstAttr(['.btn-interest'], 'data-url')

  const securityId = requestSecurityId
    ?? jobActionUrl.match(/[?&]securityId=([^&]+)/)?.[1]
    ?? ''
  const encryptId = window.location.pathname.match(/\/job_detail\/([^./?]+)\.html/)?.[1]
    ?? jobActionUrl.match(/[?&]jobId=([^&]+)/)?.[1]
    ?? ''
  const encryptUserId = queryFirstAttr(['.btn-startchat'], 'redirect-url').match(/[?&]id=([^&]+)/)?.[1]
    ?? ''

  const stageName = queryFirstText(['.sider-company .icon-stage + *', '.sider-company p:has(.icon-stage)'])
  const scaleName = queryFirstText(['.sider-company .icon-scale + *', '.sider-company p:has(.icon-scale)'])
  const industryName = queryFirstText(['.sider-company .icon-industry + *', '.sider-company p:has(.icon-industry) a'])
  const brandHref = queryFirstAttr(['.sider-company .company-info a[href*="/gongsi/"]'], 'href')
  const encryptBrandId = brandHref.match(/\/gongsi\/([^./?]+)\.html/)?.[1] ?? ''
  const brandLogo = queryFirstAttr(['.sider-company .company-info img'], 'src')
  const bossAvatar = queryFirstAttr(['.job-boss-info img'], 'src')
  const activeTimeDesc = queryFirstText(['.boss-active-time'])
  const tags = Array.from(document.querySelectorAll('.job-tags span'))
    .map(node => node.textContent?.trim() ?? '')
    .filter(Boolean)
  const isFriend = queryFirstAttr(['.btn-startchat'], 'data-isfriend') === 'true'

  if (!jobName || !description || !bossName || !brandName || !securityId || !encryptId || !encryptUserId || !lid) {
    return null
  }

  return {
    pageType: 0,
    selfAccess: false,
    securityId,
    sessionId: '',
    lid,
    jobInfo: {
      encryptId,
      encryptUserId,
      invalidStatus: false,
      jobName,
      position: 0,
      positionName: jobName,
      location: 0,
      locationName: queryFirstText(['.job-location', '.location-address', '.similar-job-location']),
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
      address: queryFirstText(['.location-address', '.job-location', '.job-address']),
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
      jobStatusDesc: '',
    },
    bossInfo: {
      name: bossName,
      title: bossTitle,
      tiny: bossAvatar,
      large: bossAvatar,
      activeTimeDesc,
      bossOnline: activeTimeDesc.includes('刚刚') || activeTimeDesc.includes('在线'),
      brandName,
      bossSource: 0,
      certificated: document.querySelector('.job-boss-info .icon-vip') != null,
      tagIconUrl: null,
      avatarStickerUrl: null,
    },
    brandComInfo: {
      encryptBrandId,
      brandName,
      logo: brandLogo,
      stage: 0,
      stageName,
      scale: 0,
      scaleName,
      industry: 0,
      industryName,
      introduce: '',
      labels: tags,
      activeTime: Date.now(),
      visibleBrandInfo: true,
      focusBrand: false,
      customerBrandName: brandName,
      customerBrandStageName: stageName,
    },
    oneKeyResumeInfo: {
      inviteType: 0,
      alreadySend: isFriend,
      canSendResume: false,
      canSendPhone: false,
      canSendWechat: false,
    },
    relationInfo: {
      interestJob: false,
      beFriend: isFriend,
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
  } satisfies bossZpDetailData
}

async function fetchDetailFromApi() {
  const { securityId, lid } = readDetailRequestParams()
  if (!securityId || !lid) {
    throw new Error('未能从详情页读取职位参数')
  }

  const response = await requestDetail({ securityId, lid })
  if (response.data.code !== 0 || !isDetailData(response.data.zpData)) {
    throw new Error(response.data.message || '职位详情接口返回无效数据')
  }

  return response.data.zpData
}

async function ensureDetailReady() {
  if (detail.value) {
    return detail.value
  }

  if (detailPromise) {
    return detailPromise
  }

  detailPromise = (async () => {
    const resolved = readDetailFromCache()
      ?? readDetailFromVue()
      ?? readDetailFromGlobals()
      ?? buildDetailFromDom()
      ?? await fetchDetailFromApi()

    detail.value = resolved
    return resolved
  })().finally(() => {
    detailPromise = null
  })

  return detailPromise
}

async function ensureAiReady() {
  if (initPromise) {
    return initPromise
  }

  initPromise = (async () => {
    await conf.confInit()
    await model.initModel()
    await signedKey.initSignedKey()

    if (!conf.formData.aiGreeting.enable) {
      throw new Error('请先在配置中开启 AI 打招呼')
    }

    const modelIssue = getAiGreetingModelIssue()
    if (modelIssue) {
      throw new Error(modelIssue)
    }
  })().finally(() => {
    initPromise = null
  })

  return initPromise
}

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

async function copyToClipboard(content: string) {
  try {
    await navigator.clipboard.writeText(content)
    return true
  }
  catch {
    const textarea = document.createElement('textarea')
    textarea.value = content
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    textarea.remove()
    return copied
  }
}

async function handleGenerateAndCopy() {
  if (loading.value) {
    return
  }

  loading.value = true
  try {
    const [, detailData] = await Promise.all([
      ensureAiReady(),
      ensureDetailReady(),
    ])

    const listData = createDetailListData(detailData)
    const ctx: logData = { listData }
    const generatedContent = await prepareAiGreeting(ctx)
    const copied = await copyToClipboard(generatedContent)

    if (!copied) {
      throw new Error('复制失败，请检查浏览器剪贴板权限')
    }

    ElMessage.success('AI 内容已复制到剪贴板')
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('详情页 AI 复制失败', error)
    ElMessage.error(message)
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="boss-helper-detail-action">
    <ElButton
      class="boss-helper-detail-action__button"
      type="primary"
      :loading="loading"
      @click="handleGenerateAndCopy"
    >
      AI 复制
    </ElButton>
  </div>
</template>

<style lang="scss" scoped>
.boss-helper-detail-action {
  position: fixed;
  right: 28px;
  bottom: 150px;
  z-index: 2147483647;
}

.boss-helper-detail-action__button {
  min-width: 96px;
  height: 44px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #1c7ef2, #1560b8);
  box-shadow: 0 18px 40px rgb(21 96 184 / 22%);
  backdrop-filter: blur(12px);
}

@media (max-width: 768px) {
  .boss-helper-detail-action {
    right: 18px;
    bottom: 118px;
  }
}
</style>
