import { defineStore } from 'pinia'
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

// 主题类型
export type ThemeType = 'light' | 'dark' | 'auto'

// 实际应用的主题（light 或 dark）
export type AppliedTheme = 'light' | 'dark'

// 本地存储键名
const THEME_STORAGE_KEY = 'app-theme-setting'

// 白天开始时间（小时）
const DAY_START_HOUR = 6
// 夜晚开始时间（小时）
const NIGHT_START_HOUR = 18

export const useThemeStore = defineStore('theme', () => {
  // 用户设置的主题偏好
  const themeSetting = ref<ThemeType>('auto')
  
  // 实际应用的主题（根据自动模式计算得出）
  const appliedTheme = ref<AppliedTheme>('light')
  
  // 计算当前是否是白天
  const isDaytime = (): boolean => {
    const hour = new Date().getHours()
    return hour >= DAY_START_HOUR && hour < NIGHT_START_HOUR
  }
  
  // 根据设置和当前时间计算实际应用的主题
  const calculateAppliedTheme = (): AppliedTheme => {
    if (themeSetting.value === 'auto') {
      return isDaytime() ? 'light' : 'dark'
    }
    return themeSetting.value
  }
  
  // 更新实际应用的主题
  const updateAppliedTheme = () => {
    appliedTheme.value = calculateAppliedTheme()
  }
  
  // 设置主题
  const setTheme = (theme: ThemeType) => {
    themeSetting.value = theme
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    updateAppliedTheme()
  }
  
  // 从本地存储加载主题设置
  const loadThemeFromStorage = () => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeType | null
    if (saved && ['light', 'dark', 'auto'].includes(saved)) {
      themeSetting.value = saved
    }
    updateAppliedTheme()
  }
  
  // 自动切换主题的时间检查器
  let autoSwitchInterval: number | null = null
  
  // 启动自动切换检查
  const startAutoSwitch = () => {
    // 每分钟检查一次是否需要切换主题
    autoSwitchInterval = window.setInterval(() => {
      if (themeSetting.value === 'auto') {
        const newTheme = calculateAppliedTheme()
        if (newTheme !== appliedTheme.value) {
          appliedTheme.value = newTheme
        }
      }
    }, 60 * 1000)
  }
  
  // 停止自动切换检查
  const stopAutoSwitch = () => {
    if (autoSwitchInterval !== null) {
      clearInterval(autoSwitchInterval)
      autoSwitchInterval = null
    }
  }
  
  // 初始化
  const init = () => {
    loadThemeFromStorage()
    startAutoSwitch()
  }
  
  // 清理
  const cleanup = () => {
    stopAutoSwitch()
  }
  
  // 主题显示文本
  const themeLabel = computed(() => {
    const labels: Record<ThemeType, string> = {
      light: '亮色',
      dark: '暗色',
      auto: '自动'
    }
    return labels[themeSetting.value]
  })
  
  // 实际应用的主题文本
  const appliedThemeLabel = computed(() => {
    return appliedTheme.value === 'light' ? '亮色' : '暗色'
  })
  
  // 是否是自动模式
  const isAutoMode = computed(() => themeSetting.value === 'auto')
  
  return {
    themeSetting,
    appliedTheme,
    themeLabel,
    appliedThemeLabel,
    isAutoMode,
    setTheme,
    init,
    cleanup,
    updateAppliedTheme,
    loadThemeFromStorage,
    startAutoSwitch
  }
})
