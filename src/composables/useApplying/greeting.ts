import type { MessageSendOptions, MessageSendResult } from '@/composables/useWebSocket'
import type { logData } from '@/stores/log'
import { ElMessage } from 'element-plus'
import { useChat } from '@/composables/useChat'
import { useModel } from '@/composables/useModel'
import { Message } from '@/composables/useWebSocket'
import { useConf } from '@/stores/conf'
import { useSignedKey } from '@/stores/signedKey'
import { useUser } from '@/stores/user'
import { GreetError } from '@/types/deliverError'
import { getCurDay, getCurTime } from '@/utils'
import { logger } from '@/utils/logger'
import { SignedKeyLLM } from '../useModel/signedKey'
import { errorHandle, requestBossData } from './utils'

const AI_GREETING_MODEL_NOT_CONFIGURED = '请先配置 AI 打招呼模型'
const AI_GREETING_MODEL_SYNCING = '正在同步在线模型'
const AI_GREETING_MODEL_SYNC_FAILED = '在线模型同步失败，请稍后重试'
const AI_GREETING_MODEL_INVALID = '未找到可用的 AI 模型，请重新选择或保存'

export function resolveAiGreetingModelSelection() {
  const model = useModel()
  const conf = useConf()
  const signedKey = useSignedKey()
  const configuredKey = conf.formData.aiGreeting.model
  const configuredModel = model.modelData.find(
    item => configuredKey === item.key && item.data != null,
  )
  const fallbackModel = model.modelData.find(item => item.data != null)
  const hasSignedModelSource = Boolean(signedKey.signedKey || signedKey.signedKeyBak)
  const needsSignedModelSync = !conf.formData.aiGreeting.vip
    && Boolean(configuredKey)
    && !configuredModel
    && hasSignedModelSource
  const needsFallback = !conf.formData.aiGreeting.vip
    && Boolean(configuredKey)
    && !configuredModel
    && fallbackModel != null
    && !hasSignedModelSource
  const currentModel = configuredModel ?? (needsFallback ? fallbackModel : undefined)

  let issue = ''
  if (!conf.formData.aiGreeting.vip) {
    if (!configuredKey) {
      issue = AI_GREETING_MODEL_NOT_CONFIGURED
    }
    else if (!configuredModel) {
      if (needsSignedModelSync && signedKey.isSignedModelSyncing) {
        issue = AI_GREETING_MODEL_SYNCING
      }
      else if (needsSignedModelSync && signedKey.signedModelSyncError) {
        issue = AI_GREETING_MODEL_SYNC_FAILED
      }
      else if (!currentModel) {
        issue = AI_GREETING_MODEL_INVALID
      }
    }
  }

  return {
    configuredModel,
    currentModel,
    issue,
    needsFallback,
    needsSignedModelSync,
  }
}

export function getAiGreetingModelIssue(): string {
  return resolveAiGreetingModelSelection().issue
}

export function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim()
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
          return item.text
        }
        return ''
      })
      .join('')
      .trim()
  }
  if (content && typeof content === 'object' && 'text' in content && typeof content.text === 'string') {
    return content.text.trim()
  }
  return ''
}

function buildSendTarget(ctx: logData): string {
  const encryptBossId = ctx.bossData?.data.encryptBossId || ctx.listData.encryptBossId
  const targetName = ctx.bossData?.data.name || ctx.listData.bossName
  if (targetName && encryptBossId) {
    return `${targetName}(${encryptBossId})`
  }
  return targetName || encryptBossId || '未知联系人'
}

function buildSendLogMessage(target: string, content: string, fromAI: boolean, resultMessage: string): string {
  const source = fromAI ? 'AI生成消息' : '消息内容'
  return `发送给 ${target} 已尝试发送；${source}：${content}；状态：${resultMessage}`
}

export function chatBossMessage(ctx: logData, msg: string) {
  const { chatMessages } = useChat()
  const d = new Date()
  chatMessages.value.push({
    id: d.getTime(),
    role: 'boss',
    content: msg,
    date: [getCurDay(d), getCurTime(d)],
    name: ctx.listData.brandName,
    avatar: ctx.listData.brandLogo,
  })
}

export async function ensureBossData(ctx: logData) {
  if (ctx.bossData == null) {
    const bossData = await requestBossData(ctx.listData.card!)
    ctx.bossData = bossData
  }
}

export async function sendGreetingByContent(
  ctx: logData,
  content: string,
  fromAI: boolean,
  sendOptions?: MessageSendOptions,
): Promise<MessageSendResult> {
  const uid = useUser().getUserId()
  if (uid == null) {
    ElMessage.error('没有获取到uid,请刷新重试')
    throw new GreetError('没有获取到uid')
  }
  const finalContent = extractTextContent(content)
  if (!finalContent) {
    throw new GreetError('未生成可发送的招呼语，已终止发送')
  }
  await ensureBossData(ctx)
  const target = buildSendTarget(ctx)

  const buf = new Message({
    form_uid: uid.toString(),
    to_uid: ctx.bossData!.data.bossId.toString(),
    to_name: ctx.bossData!.data.encryptBossId,
    content: finalContent,
  })

  const result = await buf.send(sendOptions)
  if (!result.ok) {
    ctx.message = `发送给 ${target} 失败；${fromAI ? 'AI生成消息' : '消息内容'}：${finalContent}`
    throw new GreetError(result.message)
  }
  ctx.message = buildSendLogMessage(target, finalContent, fromAI, result.message)
  return result
}

export async function prepareAiGreeting(ctx: logData): Promise<string> {
  const model = useModel()
  const conf = useConf()
  const signedKey = useSignedKey()
  let {
    currentModel,
    issue,
    needsFallback,
    needsSignedModelSync,
  } = resolveAiGreetingModelSelection()

  if (needsSignedModelSync) {
    await signedKey.ensureSignedModelsReady(5000)
    ;({
      currentModel,
      issue,
      needsFallback,
    } = resolveAiGreetingModelSelection())
  }

  if (issue) {
    ElMessage.warning(issue)
    throw new GreetError(issue)
  }

  if (needsFallback && currentModel) {
    conf.formData.aiGreeting.model = currentModel.key
    try {
      await conf.confPersistNow()
    }
    catch (error) {
      logger.error('AI 招呼语模型自动回退后的配置持久化失败', error)
    }
    ElMessage.warning(`已选 AI 模型不可用，已自动切换到: ${currentModel.name}`)
  }

  const gpt = model.getModel(currentModel, conf.formData.aiGreeting.prompt, conf.formData.aiGreeting.vip)
  if (gpt instanceof SignedKeyLLM) {
    void gpt.checkResume()
  }

  try {
    const { content, prompt, reasoning_content } = await gpt.message({
      data: {
        data: ctx.listData,
        boss: ctx.bossData,
        card: ctx.listData.card!,
        amap: {},
      },
      onPrompt: s => chatBossMessage(ctx, s),
    }, 'aiGreeting')
    const aiContent = extractTextContent(content)
    if (!aiContent) {
      throw new GreetError('AI返回空内容')
    }
    ctx.aiGreetingQ = prompt ?? 'AI请求失败'
    ctx.aiGreetingA = aiContent
    ctx.aiGreetingR = reasoning_content
    ctx.aiGreetingPrepared = aiContent
    return aiContent
  }
  catch (e) {
    throw new GreetError(errorHandle(e))
  }
}
