import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { logger } from '@/utils/logger'
import DetailAiGreeting from './components/DetailAiGreeting.vue'

const ROOT_ID = 'boss-helper-detail-action'

async function mountVue() {
  if (document.getElementById(ROOT_ID)) {
    return
  }

  const app = createApp(DetailAiGreeting)
  app.use(createPinia())

  const root = document.createElement('div')
  root.id = ROOT_ID
  document.body.appendChild(root)
  app.mount(root)
}

export async function run() {
  logger.info('加载/job_detail页面Hook')
  return mountVue()
}
