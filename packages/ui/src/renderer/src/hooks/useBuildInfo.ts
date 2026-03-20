import _buildInfo from '../../../common/build-info.json'
import { shallowRef } from 'vue'

// 从 vite define 注入的全局变量获取版本号，优先使用 git tag 版本
declare const __APP_VERSION__: string

export default function useBuildInfo() {
  const buildInfo = shallowRef({
    ...JSON.parse(JSON.stringify(_buildInfo)),
    // 使用 git tag 的版本号（构建时注入）
    version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : _buildInfo.version
  })
  return {
    buildInfo
  }
}
