import { resolve } from 'node:path'
import process from 'node:process'
import { defineWebExtConfig } from 'wxt'

const chromeUserDataDir = resolve(process.cwd(), '.wxt/chrome-user-data')
const chromeBinary = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export default defineWebExtConfig({
  binaries: {
    chrome: chromeBinary,
  },
  chromiumProfile: chromeUserDataDir,
  startUrls: [
    'https://www.zhipin.com/',
  ],
  chromiumArgs: [
    '--profile-directory=Default',
  ],
  keepProfileChanges: true,
})
