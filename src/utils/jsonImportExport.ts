import { ElMessage } from 'element-plus'

export function exportJson(data: object, name: string) {
  const blob = new Blob([JSON.stringify(data)], {
    type: 'application/json',
  })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${name}.json`
  link.click()
}

export async function importJson<T = any>(): Promise<T> {
  const fileInput = document.createElement('input')
  fileInput.type = 'file'

  return new Promise((resolve, reject) => {
    fileInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file || !file.name.endsWith('.json')) {
        ElMessage.error('不是 JSON 文件')
        reject(new Error('不是 JSON 文件'))
        return
      }

      const reader = new FileReader()
      reader.onload = function (event) {
        try {
          const jsonData: T = JSON.parse(event.target!.result as string)
          const type = Object.prototype.toString.call(jsonData).slice(8, -1)
          if (!['Array', 'Object'].includes(type)) {
            ElMessage.error('内容非合法 JSON')
            reject(new Error('内容非合法 JSON'))
            return
          }
          resolve(jsonData)
        }
        catch (error: any) {
          const message = `内容非合法 JSON, ${error.message}`
          ElMessage.error(message)
          reject(new Error(message))
        }
      }
      reader.onerror = () => {
        const message = '读取文件失败'
        ElMessage.error(message)
        reject(new Error(message))
      }
      reader.readAsText(file)
    })

    fileInput.click()
  })
}
