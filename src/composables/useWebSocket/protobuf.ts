import type { TechwolfChatProtocol } from './type'
import { ElMessage } from 'element-plus'
import { AwesomeMessage } from './type'

interface MessageArgs {
  form_uid: string
  to_uid: string
  to_name: string // encryptBossId  擦,boss的id不是岗位的
  content?: string
  image?: string // url
}

export interface MessageSenderInfo {
  label: string
  send: (message: Message) => Promise<void>
}

export interface MessageSendOptions {
  waitForChannelMs?: number
  pollIntervalMs?: number
}

export interface MessageSendResult {
  ok: boolean
  message: string
  channel?: string
  confirmed?: boolean
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function getAvailableMessageSenders(): MessageSenderInfo[] {
  const senders: MessageSenderInfo[] = []
  const socketReadyState = window.socket?.readyState
  const canUseChatWebsocket = typeof window.ChatWebsocket?.send === 'function'
    && (socketReadyState == null || socketReadyState === WebSocket.OPEN)

  if (canUseChatWebsocket) {
    senders.push({
      label: 'ChatWebsocket',
      send: async (message: Message) => {
        await Promise.resolve(window.ChatWebsocket!.send(message))
      },
    })
  }

  const geekClient = window.GeekChatCore?.getInstance?.()?.getClient?.()?.client
  if (typeof geekClient?.send === 'function') {
    senders.push({
      label: 'GeekChatCore',
      send: async (message: Message) => {
        await Promise.resolve(geekClient.send(message))
      },
    })
  }

  return senders
}

export async function waitForMessageSenders(timeoutMs = 0, pollIntervalMs = 150): Promise<MessageSenderInfo[]> {
  let senders = getAvailableMessageSenders()
  if (senders.length > 0 || timeoutMs <= 0) {
    return senders
  }

  const endAt = Date.now() + timeoutMs
  while (Date.now() < endAt) {
    await sleep(pollIntervalMs)
    senders = getAvailableMessageSenders()
    if (senders.length > 0) {
      return senders
    }
  }

  return senders
}

export class Message {
  msg: Uint8Array
  hex: string
  args: MessageArgs

  constructor(args: MessageArgs) {
    this.args = args
    const r = new Date().getTime()
    const d = r + 68256432452609
    const data: TechwolfChatProtocol = {
      messages: [
        {
          from: {
            uid: args.form_uid,
            source: 0,
          },
          to: {
            uid: args.to_uid,
            name: args.to_name,
            source: 0,
          },
          type: 1,
          mid: d.toString(),
          time: r.toString(),
          body: {
            type: 1,
            templateId: 1,
            text: args.content,
            // image: {},
          },
          cmid: d.toString(),
        },
      ],
      type: 1,
    }

    this.msg = AwesomeMessage.encode(data).finish().slice()
    this.hex = [...this.msg]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  toArrayBuffer(): ArrayBuffer {
    return this.msg.buffer.slice(0, this.msg.byteLength) as ArrayBuffer
  }

  async send(options: MessageSendOptions = {}): Promise<MessageSendResult> {
    const senders = await waitForMessageSenders(
      options.waitForChannelMs ?? 0,
      options.pollIntervalMs ?? 150,
    )

    if (senders.length === 0) {
      const message = '当前页面聊天通道未就绪，请手动打开聊天窗口后重试'
      ElMessage.error(message)
      return { ok: false, message }
    }

    const errors: string[] = []
    for (const sender of senders) {
      try {
        await sender.send(this)
        return {
          ok: true,
          message: `已调用 ${sender.label} 发送通道，请以聊天窗口实际结果为准`,
          channel: sender.label,
          confirmed: false,
        }
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        errors.push(`${sender.label}: ${message}`)
      }
    }

    const message = errors.join('；') || '消息发送失败'
    ElMessage.error(`消息发送失败: ${message}`)
    return { ok: false, message }
  }
}
