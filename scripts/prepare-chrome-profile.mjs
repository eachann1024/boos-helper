import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const chromeUserDataDir = resolve(process.cwd(), '.wxt/chrome-user-data')
const defaultProfileDir = resolve(chromeUserDataDir, 'Default')

await mkdir(defaultProfileDir, { recursive: true })
