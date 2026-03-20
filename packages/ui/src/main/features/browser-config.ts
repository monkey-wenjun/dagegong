import { readConfigFile, writeConfigFile } from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'

export interface BrowserConfig {
  headless: boolean
  // 可以添加更多浏览器配置选项
  windowWidth?: number
  windowHeight?: number
}

const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
  headless: false,
  windowWidth: 1440,
  windowHeight: 900
}

export async function getBrowserConfig(): Promise<BrowserConfig> {
  const config = await readConfigFile('browser-config.json')
  if (!config) {
    return { ...DEFAULT_BROWSER_CONFIG }
  }
  return {
    ...DEFAULT_BROWSER_CONFIG,
    ...config
  }
}

export async function saveBrowserConfig(config: BrowserConfig): Promise<void> {
  await writeConfigFile('browser-config.json', config)
}
