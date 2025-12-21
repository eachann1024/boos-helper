import { ProvideBackgroundAdapter, provideBackgroundCounter } from '@/message/background'

export default defineBackground({
  main() {
    provideBackgroundCounter(new ProvideBackgroundAdapter())
  },
})
