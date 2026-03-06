import type { StepFactory } from './type'
import { miTem } from 'mitem'
import { useModel } from '@/composables/useModel'
import { useStatistics } from '@/composables/useStatistics'
import { counter } from '@/message'

import { useConf } from '@/stores/conf'

import { useUser } from '@/stores/user'
import {
  ActivityError,
  AIFilteringError,
  CompanyNameError,
  CompanySizeError,
  FriendStatusError,
  GoldHunterError,
  GreetError,
  HrPositionError,
  JobAddressError,
  JobDescriptionError,
  JobTitleError,
  RepeatError,
  SalaryError,
} from '@/types/deliverError'
import { SignedKeyLLM } from '../useModel/signedKey'
import { chatBossMessage, prepareAiGreeting, sendGreetingByContent } from './greeting'
import { errorHandle, parseFiltering, rangeMatch, rangeMatchFormat, sameCompanyKey, sameHrKey } from './utils'

export function handles() {
  const model = useModel()
  const conf = useConf()
  const statistics = useStatistics()

  const communicated: StepFactory = () => {
    return async ({ data }) => {
      if (data.contact) {
        throw new RepeatError(`已经沟通过`)
      }
    }
  }

  const SameCompanyFilter: StepFactory = () => {
    if (!conf.formData.sameCompanyFilter.value) {
      return
    }
    let someSet: Set<string> | null = null
    let count = 0
    const uid = useUser().getUserId()
    if (uid == null) {
      throw new RepeatError('没有获取到uid')
    }
    return {
      fn: async ({ data }) => {
        if (someSet == null) {
          someSet = new Set<string>()
          const data = await counter.storageGet<Record<string, string[]>>(sameCompanyKey, {})
          for (const id of (data[uid] ?? [])) {
            someSet.add(id)
          }
        }
        const id = data.encryptBrandId
        if (id != null && someSet.has(id)) {
          throw new RepeatError('相同公司已投递')
        }
      },
      after: async ({ data }) => {
        someSet?.add(data.encryptBrandId)
        count++
        if (count > 3) {
          const oldData = await counter.storageGet<Record<string, string[]>>(sameCompanyKey, {})
          await counter.storageSet(sameCompanyKey, {
            ...oldData,
            [uid]: Array.from(someSet ?? []),
          })
          count = 0
        }
      },
    }
  }

  const SameHrFilter: StepFactory = () => {
    if (!conf.formData.sameHrFilter.value) {
      return
    }
    let someSet: Set<string> | null = null
    let count = 0
    const uid = useUser().getUserId()
    if (uid == null) {
      throw new RepeatError('没有获取到uid')
    }
    return {
      fn: async ({ data }) => {
        if (someSet == null) {
          someSet = new Set<string>()
          const data = await counter.storageGet<Record<string, string[]>>(sameHrKey, {})
          for (const id of (data[uid] ?? [])) {
            someSet.add(id)
          }
        }
        const id = data.encryptBossId
        if (id != null && someSet.has(id)) {
          throw new RepeatError('相同hr已投递')
        }
      },
      after: async ({ data }) => {
        someSet?.add(data.encryptBossId)
        count++
        if (count > 3) {
          const oldData = await counter.storageGet<Record<string, string[]>>(sameHrKey, {})
          await counter.storageSet(sameHrKey, {
            ...oldData,
            [uid]: Array.from(someSet ?? []),
          })
          count = 0
        }
      },
    }
  }

  const jobTitle: StepFactory = () => {
    if (!conf.formData.jobTitle.enable) {
      return
    }
    return async ({ data }, _ctx) => {
      try {
        const text = data.jobName.toLowerCase()
        if (!text)
          throw new JobTitleError('岗位名为空')
        for (const x of conf.formData.jobTitle.value) {
          if (text.includes(x.toLowerCase())) {
            if (conf.formData.jobTitle.include) {
              return
            }
            throw new JobTitleError(`岗位名含有排除关键词 [${x}]`)
          }
        }
        if (conf.formData.jobTitle.include) {
          throw new JobTitleError('岗位名不包含关键词')
        }
      }
      catch (e) {
        statistics.todayData.jobTitle++
        throw new JobTitleError(errorHandle(e))
      }
    }
  }

  const goldHunterFilter: StepFactory = () => {
    if (!conf.formData.goldHunterFilter.value) {
      return
    }
    return async ({ data }, _ctx) => {
      if (data?.goldHunter === 1) {
        statistics.todayData.goldHunterFilter++
        throw new GoldHunterError('猎头过滤')
      }
    }
  }

  const company: StepFactory = () => {
    if (!conf.formData.company.enable)
      return
    return async ({ data }, _ctx) => {
      try {
        const text = data.brandName
        if (!text)
          throw new CompanyNameError('公司名为空')

        for (const x of conf.formData.company.value) {
          if (text.includes(x)) {
            if (conf.formData.company.include) {
              return
            }
            throw new CompanyNameError(`公司名含有排除关键词 [${x}]`)
          }
        }
        if (conf.formData.company.include) {
          throw new CompanyNameError('公司名不包含关键词')
        }
      }
      catch (e) {
        statistics.todayData.company++
        throw new CompanyNameError(errorHandle(e))
      }
    }
  }

  const salaryRange: StepFactory = () => {
    if (!conf.formData.salaryRange.enable) {
      return
    }
    const arr = [
      ['元/时', conf.formData.salaryRange.advancedValue.H],
      ['元/天', conf.formData.salaryRange.advancedValue.D],
      ['元/月', conf.formData.salaryRange.advancedValue.M],
      ['K', conf.formData.salaryRange.value],
    ] as const
    return async ({ data }, _ctx) => {
      try {
        const text = data.salaryDesc
        for (const key of arr) {
          if (text.includes(key[0])) {
            if (!rangeMatch(text, key[1])) {
              throw new SalaryError(
                `不匹配的薪资范围 ${text}, 预期: ${rangeMatchFormat(key[1], key[0])}`,
              )
            }
          }
        }
      }
      catch (e) {
        statistics.todayData.salaryRange++
        throw new SalaryError(errorHandle(e))
      }
    }
  }

  const companySizeRange: StepFactory = () => {
    if (!conf.formData.companySizeRange.enable) {
      return
    }
    return async ({ data }, _ctx) => {
      try {
        const text = data.brandScaleName
        if (!rangeMatch(text, conf.formData.companySizeRange.value)) {
          throw new CompanySizeError(
            `不匹配的公司规模 ${text}, 预期: ${rangeMatchFormat(conf.formData.companySizeRange.value, '人')}`,
          )
        }
      }
      catch (e) {
        statistics.todayData.companySizeRange++
        throw new CompanySizeError(errorHandle(e))
      }
    }
  }

  const jobContent: StepFactory = () => {
    if (!conf.formData.jobContent.enable) {
      return
    }
    return async (_, ctx) => {
      try {
        const content = ctx.listData.card?.postDescription.toLowerCase()
        for (const x of conf.formData.jobContent.value) {
          if (!x) {
            continue
          }
          const re = new RegExp(
            `(?<!(不|无).{0,5})${x.toLowerCase()}(?!系统|软件|工具|服务)`,
          )
          if (content != null && re.test(content)) {
            if (conf.formData.jobContent.include) {
              return
            }
            throw new JobDescriptionError(`工作内容含有排除关键词 [${x}]`)
          }
        }
        if (conf.formData.jobContent.include) {
          throw new JobDescriptionError('工作内容中不包含关键词')
        }
      }
      catch (e) {
        statistics.todayData.jobContent++
        throw new JobDescriptionError(errorHandle(e))
      }
    }
  }

  const hrPosition: StepFactory = () => {
    if (!conf.formData.hrPosition.enable) {
      return
    }
    return async (_, ctx) => {
      try {
        const content = ctx.listData.card?.bossTitle
        for (const x of conf.formData.hrPosition.value) {
          if (!x) {
            continue
          }
          if (content != null && content.trim() === x) {
            if (conf.formData.hrPosition.include) {
              return
            }
            throw new HrPositionError(`Hr职位在黑名单中 ${content}`)
          }
        }
        if (conf.formData.hrPosition.include) {
          throw new HrPositionError(`Hr职位不在白名单中: ${content}`)
        }
      }
      catch (e) {
        statistics.todayData.hrPosition++
        throw new HrPositionError(errorHandle(e))
      }
    }
  }

  const jobAddress: StepFactory = () => {
    if (!conf.formData.jobAddress.enable) {
      return
    }
    return async (_, ctx) => {
      try {
        if (conf.formData.jobAddress.value.length === 0) {
          return
        }
        const content = ctx.listData.card?.address.trim()
        for (const x of conf.formData.jobAddress.value) {
          if (!x) {
            continue
          }
          if (content?.includes(x)) {
            return
          }
        }
        throw new JobAddressError(`工作地址不包含关键词: ${content}`)
      }
      catch (e) {
        statistics.todayData.jobAddress++
        throw new JobAddressError(errorHandle(e))
      }
    }
  }

  const jobFriendStatus: StepFactory = () => {
    if (!conf.formData.friendStatus.value) {
      return
    }
    return async (_, ctx) => {
      const content = ctx.listData.card?.friendStatus

      if (content != null && content !== 0) {
        throw new FriendStatusError('已经是好友了')
      }
    }
  }

  const aiFiltering: StepFactory = () => {
    if (!conf.formData.aiFiltering.enable) {
      return
    }
    const curModel = model.modelData.find(
      v => conf.formData.aiFiltering.model === v.key,
    )
    if (!curModel && !conf.formData.aiFiltering.vip) {
      throw new AIFilteringError('没有找到AI筛选的模型')
    }
    const gpt = model.getModel(curModel, conf.formData.aiFiltering.prompt, conf.formData.aiFiltering.vip)
    if (gpt instanceof SignedKeyLLM) {
      void gpt.checkResume()
    }
    return async (_, ctx) => {
      // const chatInput = chatInputInit(model)
      try {
        const { content, prompt, reasoning_content } = await gpt.message({
          data: {
            data: ctx.listData,
            boss: ctx.bossData,
            card: ctx.listData.card!,
            amap: {
              straightDistance: (ctx.amap?.distance?.straight.distance ?? 0) / 1000,
              drivingDistance: (ctx.amap?.distance?.driving.distance ?? 0) / 1000,
              drivingDuration: (ctx.amap?.distance?.driving.duration ?? 0) / 60,
              walkingDistance: (ctx.amap?.distance?.walking.distance ?? 0) / 1000,
              walkingDuration: (ctx.amap?.distance?.walking.duration ?? 0) / 60,
            },
          },
          amap: conf.formData.amap.enable
            ? `直线距离:${(ctx.amap?.distance?.straight.distance ?? 0) / 1000}km
驾车距离:${(ctx.amap?.distance?.driving.distance ?? 0) / 1000}km
驾车时间:${(ctx.amap?.distance?.driving.duration ?? 0) / 60}分钟
步行距离:${(ctx.amap?.distance?.walking.distance ?? 0) / 1000}km
步行时间:${(ctx.amap?.distance?.walking.duration ?? 0) / 60}分钟`
            : '',
          json: true,
          // onStream: chatInput.handle,
          onPrompt: s => chatBossMessage(ctx, s),
        }, 'aiFiltering')

        ctx.aiFilteringQ = prompt
        if (content == null) {
          return
        }
        const { res, message, rating } = parseFiltering(content)

        ctx.aiFilteringAjson = res || {}
        ctx.aiFilteringAtext = message
        ctx.aiFilteringR = reasoning_content

        // chatInput.end(message)
        if (rating < (conf.formData.aiFiltering.score ?? 10)) {
          throw new AIFilteringError(message)
        }
      }
      catch (e) {
        statistics.todayData.jobContent++
        // chatInput.end('Err~')
        throw new AIFilteringError(errorHandle(e))
      }
    }
  }

  const activityFilter: StepFactory = () => {
    if (!conf.formData.activityFilter.value) {
      return
    }
    return async (_, ctx) => {
      try {
        const activeText = ctx.listData.card?.activeTimeDesc
        if (activeText == null || activeText.includes('月') || activeText.includes('年'))
          throw new ActivityError(`不活跃,当前活跃度 [${activeText}]`)
      }
      catch (e) {
        statistics.todayData.activityFilter++
        throw new ActivityError(errorHandle(e))
      }
    }
  }

  const customGreeting: StepFactory = () => {
    const template = miTem.compile(conf.formData.customGreeting.value)
    return {
      after: async (_args, ctx) => {
        try {
          let msg = conf.formData.customGreeting.value
          if (conf.formData.greetingVariable.value && ctx.listData.card) {
            msg = template({
              data: ctx.listData,
              boss: ctx.bossData,
              card: ctx.listData.card,
              amap: {
                straightDistance: (ctx.amap?.distance?.straight.distance ?? 0) / 1000,
                drivingDistance: (ctx.amap?.distance?.driving.distance ?? 0) / 1000,
                drivingDuration: (ctx.amap?.distance?.driving.duration ?? 0) / 60,
                walkingDistance: (ctx.amap?.distance?.walking.distance ?? 0) / 1000,
                walkingDuration: (ctx.amap?.distance?.walking.duration ?? 0) / 60,
              },
            })
          }
          await sendGreetingByContent(ctx, msg, false)
        }
        catch (e) {
          throw new GreetError(errorHandle(e))
        }
      },
    }
  }

  const aiGreeting: StepFactory = () => {
    return {
      fn: async (_args, ctx) => {
        try {
          await prepareAiGreeting(ctx)
        }
        catch (e) {
          throw new GreetError(errorHandle(e))
        }
      },
      after: async (_args, ctx) => {
        try {
          const finalContent = ctx.aiGreetingPrepared?.trim()
          if (!finalContent) {
            throw new GreetError('未生成可发送的招呼语，已终止发送')
          }
          await sendGreetingByContent(ctx, finalContent, true)
        }
        catch (e) {
          throw new GreetError(errorHandle(e))
        }
      },
    }
  }

  const greeting: StepFactory = () => {
    if (conf.formData.aiGreeting.enable) {
      // AI招呼语
      return aiGreeting()
    }
    else if (conf.formData.customGreeting.enable) {
      // 自定义招呼语
      return customGreeting()
    }
  }

  function amapHandler(id: string, distance: number, duration: number, amap?: { ok: boolean, distance: number, duration: number }) {
    if (!amap || amap.ok === false) {
      throw new JobAddressError('高德地图未初始化')
    }
    if (distance > 0 && amap.distance > distance * 1000) {
      throw new JobAddressError(`${id}距离超标: ${amap.distance / 1000} 设定: ${conf.formData.amap.straightDistance}`)
    }
    if (duration > 0 && amap.duration > duration * 60) {
      throw new JobAddressError(`${id}时间超标: ${amap.duration / 60} 设定: ${conf.formData.amap.drivingDuration}`)
    }
  }

  const amap: StepFactory = () => {
    if (!conf.formData.amap.enable) {
      return
    }
    return async (_, ctx) => {
      if (ctx.amap == null || ctx.amap.distance == null) {
        throw new JobAddressError('高德地图api数据异常')
      }
      amapHandler('直线', conf.formData.amap.straightDistance, 0, ctx.amap.distance.straight)
      amapHandler('驾车', conf.formData.amap.drivingDistance, conf.formData.amap.drivingDuration, ctx.amap.distance.driving)
      amapHandler('步行', conf.formData.amap.walkingDistance, conf.formData.amap.walkingDuration, ctx.amap.distance.walking)
    }
  }

  return {
    communicated,
    SameCompanyFilter,
    SameHrFilter,
    jobTitle,
    goldHunterFilter,
    company,
    salaryRange,
    companySizeRange,
    jobContent,
    hrPosition,
    jobAddress,
    jobFriendStatus,
    aiFiltering,
    activityFilter,
    greeting,
    amap,
  }
}
