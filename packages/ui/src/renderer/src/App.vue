<template>
  <el-config-provider :locale="zhCn">
    <Suspense>
      <RouterView />
    </Suspense>
  </el-config-provider>
</template>

<script setup lang="ts">
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import { onMounted, onUnmounted, watch, ref } from 'vue'
import { gtagRenderer } from './utils/gtag'
import { useThemeStore } from './store/theme'

const themeStore = useThemeStore()
const isInitialized = ref(false)

// 应用主题到 html 元素
const applyTheme = (theme: 'light' | 'dark') => {
  document.documentElement.setAttribute('data-theme', theme)
}

// 先立即加载主题设置（不等待 onMounted）
themeStore.loadThemeFromStorage()
applyTheme(themeStore.appliedTheme)

// 监听主题变化
watch(
  () => themeStore.appliedTheme,
  (newTheme) => {
    applyTheme(newTheme)
  }
)

// 初始化
onMounted(() => {
  themeStore.startAutoSwitch()
  isInitialized.value = true
  gtagRenderer('app_component_before_create')
  gtagRenderer('app_component_mounted')
})

onUnmounted(() => {
  themeStore.cleanup()
})
</script>
