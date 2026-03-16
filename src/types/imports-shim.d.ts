declare namespace Browser {
  namespace cookies {
    type Cookie = chrome.cookies.Cookie
  }
}

declare module '#imports' {
  export * from 'vue'

  export type Browser = typeof chrome
  export type StorageItemKey = string

  export const browser: typeof chrome

  export const storage: {
    getItem<T>(key: StorageItemKey, options?: { fallback?: T }): Promise<T>
    setItem<T>(key: StorageItemKey, value: T): Promise<void>
    removeItem(key: StorageItemKey): Promise<void>
  }

  export function defineBackground<T>(background: T): T
  export function defineContentScript<T>(contentScript: T): T
  export function defineUnlistedScript<T>(script: T): T
  export function injectScript(path: string, options?: { keepInDom?: boolean }): Promise<void>
}
