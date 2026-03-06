import type { FormData } from '@/types/formData'
import { reactive, ref } from 'vue'
import { checkJobCache } from '@/composables/useApplying'
import { useHookVueData, useHookVueFn } from '@/composables/useVue'
import { logger } from '@/utils/logger'

export type EncryptJobId = bossZpJobItemData['encryptJobId']
export type JobStatus = 'pending' | 'wait' | 'running' | 'success' | 'error' | 'warn'
export type MyJobListData = bossZpJobItemData & {
  card?: bossZpDetailData & bossZpCardData
  status: {
    status: JobStatus
    msg: string
    setStatus: (status: JobStatus, msg?: string) => void
  }
  getCard: () => Promise<bossZpCardData>
}

export function normalizeDetailToCard(data: bossZpDetailData): bossZpDetailData & bossZpCardData {
  return {
    ...data,
    jobName: data.jobInfo.jobName,
    postDescription: data.jobInfo.postDescription,
    encryptJobId: data.jobInfo.encryptId,
    atsDirectPost: false,
    atsProxyJob: data.jobInfo.proxyJob === 1,
    salaryDesc: data.jobInfo.salaryDesc,
    cityName: data.jobInfo.locationName,
    experienceName: data.jobInfo.experienceName,
    degreeName: data.jobInfo.degreeName,
    jobLabels: data.jobInfo.showSkills || [],
    address: data.jobInfo.address,
    lid: data.lid,
    sessionId: data.sessionId || '',
    securityId: data.securityId,
    encryptUserId: data.jobInfo.encryptUserId,
    bossName: data.bossInfo.name,
    bossTitle: data.bossInfo.title,
    bossAvatar: data.bossInfo.tiny,
    online: data.bossInfo.bossOnline,
    certificated: data.bossInfo.certificated,
    activeTimeDesc: data.bossInfo.activeTimeDesc,
    brandName: data.brandComInfo.brandName,
    canAddFriend: true,
    friendStatus: data.relationInfo.beFriend ? 1 : 0,
    isInterested: data.relationInfo.interestJob ? 1 : 0,
    login: true,
  }
}

export function normalizeDetailToJobItem(data: bossZpDetailData): bossZpJobItemData {
  return {
    securityId: data.securityId,
    bossAvatar: data.bossInfo.tiny,
    bossCert: data.bossInfo.certificated ? 1 : 0,
    encryptBossId: data.jobInfo.encryptUserId,
    bossName: data.bossInfo.name,
    bossTitle: data.bossInfo.title,
    goldHunter: 0,
    bossOnline: data.bossInfo.bossOnline,
    encryptJobId: data.jobInfo.encryptId,
    expectId: 0,
    jobName: data.jobInfo.jobName,
    lid: data.lid,
    salaryDesc: data.jobInfo.salaryDesc,
    jobLabels: data.jobInfo.showSkills || [],
    jobValidStatus: data.jobInfo.invalidStatus ? 0 : 1,
    iconWord: '',
    skills: data.jobInfo.showSkills || [],
    jobExperience: data.jobInfo.experienceName,
    daysPerWeekDesc: '',
    leastMonthDesc: '',
    jobDegree: data.jobInfo.degreeName,
    cityName: data.jobInfo.locationName,
    areaDistrict: '',
    businessDistrict: '',
    jobType: data.jobInfo.jobType,
    proxyJob: data.jobInfo.proxyJob,
    proxyType: data.jobInfo.proxyType,
    anonymous: data.jobInfo.anonymous,
    outland: data.jobInfo.overseasInfo ? 1 : 0,
    optimal: 0,
    iconFlagList: [],
    itemId: 0,
    city: data.jobInfo.location,
    isShield: 0,
    atsDirectPost: false,
    gps: {
      longitude: data.jobInfo.longitude,
      latitude: data.jobInfo.latitude,
    },
    lastModifyTime: data.brandComInfo.activeTime || Date.now(),
    encryptBrandId: data.brandComInfo.encryptBrandId,
    brandName: data.brandComInfo.brandName,
    brandLogo: data.brandComInfo.logo,
    brandStageName: data.brandComInfo.customerBrandStageName || data.brandComInfo.stageName,
    brandIndustry: data.brandComInfo.industryName,
    brandScaleName: data.brandComInfo.scaleName,
    welfareList: (data.brandComInfo.labels || [])
      .map((item: any) => (typeof item === 'string' ? item : item?.name ?? ''))
      .filter(Boolean),
    industry: data.brandComInfo.industry,
    contact: Boolean(data.relationInfo.beFriend || data.oneKeyResumeInfo.alreadySend),
  }
}

export class JobList {
  private _vue_jobList = ref<bossZpJobItemData[]>([])
  private _vue_jobDetail = ref<bossZpDetailData>()

  _list = ref<Array<MyJobListData>>([])
  _map = reactive<Record<EncryptJobId, MyJobListData>>({})

  _use_cache = ref<boolean>(true)

  private hookJobDetail = useHookVueData('#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main', 'jobDetail', this._vue_jobDetail)
  private hookClickJobCardAction = useHookVueFn('#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main', 'clickJobCardAction')
  private clickJobCardAction = async (_: bossZpJobItemData) => {
  }

  private hookJobList = useHookVueData('#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main', 'jobList', this._vue_jobList, (v) => {
    logger.debug('初始化岗位列表', v)

    const jobSet = this._list.value.reduce((acc, item) => {
      acc.set(item.encryptJobId, item)
      return acc
    }, new Map<EncryptJobId, MyJobListData>())

    Object.assign(this._map, {})

    this._list.value = v.map((item) => {
      let val: MyJobListData
      if (jobSet.has(item.encryptJobId)) {
        val = jobSet.get(item.encryptJobId)!
      }
      else {
        const cacheCheck = this._use_cache.value ? checkJobCache(item.encryptJobId) : null

        val = {
          ...item,
          status: {
            status: cacheCheck ? cacheCheck.status : 'pending',
            msg: cacheCheck ? `${cacheCheck.message} (缓存)` : '未开始',
            setStatus: (status: JobStatus, msg?: string) => {
              this._map[item.encryptJobId].status.status = status
              this._map[item.encryptJobId].status.msg = msg ?? ''
            },
          },
          getCard: async () => {
            // TODO： 将 bossZpCardData 转换为 bossZpDetailData
            await this.clickJobCardAction(item)
            const data = await new Promise<bossZpDetailData>((resolve, reject) => {
              setTimeout(() => {
                reject(new Error('bossZpDetailData获取超时'))
              }, 1000 * 60)
              const interval = setInterval(() => {
                if (this._vue_jobDetail.value && this._vue_jobDetail.value.lid === item.lid) {
                  resolve(this._vue_jobDetail.value)
                  clearInterval(interval)
                }
              }, 100)
            })
            // const data = await requestDetail({
            //   lid: item.lid,
            //   securityId: item.securityId,
            // }).then(async (r) => {
            //   if (r.data.code !== 0) {
            //     logger.error('获取职位详情失败', r)
            //     await new Promise(resolve => setTimeout(resolve, 10000000))
            //     return null
            //   }
            //   return r.data.zpData
            // })
            const card = normalizeDetailToCard(data)
            this._map[item.encryptJobId].card = card
            return card
          },
        }
      }
      this._map[item.encryptJobId] = val
      return val
    })
  })

  async initJobList(formData: FormData) {
    this._use_cache.value = formData.useCache.value
    await this.hookJobDetail()
    this.clickJobCardAction = await this.hookClickJobCardAction()
    await this.hookJobList()
  }

  get(encryptJobId: EncryptJobId): MyJobListData | undefined {
    return this._map[encryptJobId]
  }

  set(encryptJobId: EncryptJobId, val: MyJobListData) {
    this._map[encryptJobId] = val
  }

  get list() {
    return this._list.value
  }

  get map() {
    return this._map.value
  }
}

export const jobList = new JobList()

window.__q_jobList = jobList
