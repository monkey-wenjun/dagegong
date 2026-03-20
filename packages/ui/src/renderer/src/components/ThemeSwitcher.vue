<template>
  <div class="theme-switcher">
    <div class="theme-label-title">主题设置</div>
    <div class="theme-buttons">
      <button
        class="theme-btn"
        :class="{ active: themeStore.themeSetting === 'light' }"
        @click="handleThemeChange('light')"
        title="亮色主题"
      >
        <Sunny class="theme-icon" />
        <span class="theme-text">亮色</span>
      </button>
      <button
        class="theme-btn"
        :class="{ active: themeStore.themeSetting === 'dark' }"
        @click="handleThemeChange('dark')"
        title="暗色主题"
      >
        <Moon class="theme-icon" />
        <span class="theme-text">暗色</span>
      </button>
      <button
        class="theme-btn"
        :class="{ active: themeStore.themeSetting === 'auto' }"
        @click="handleThemeChange('auto')"
        title="自动切换 (6:00-18:00 亮色)"
      >
        <Clock class="theme-icon" />
        <span class="theme-text">自动</span>
      </button>
    </div>
    <div v-if="themeStore.isAutoMode" class="theme-status">
      当前应用: {{ themeStore.appliedThemeLabel }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { Sunny, Moon, Clock } from '@element-plus/icons-vue'
import { useThemeStore, ThemeType } from '../store/theme'

const themeStore = useThemeStore()

const handleThemeChange = (command: ThemeType) => {
  themeStore.setTheme(command)
}
</script>

<style scoped lang="scss">
.theme-switcher {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  padding: 0 4px;
}

.theme-label-title {
  font-size: 12px;
  color: var(--nav-text-secondary);
  padding-left: 4px;
}

.theme-buttons {
  display: flex;
  gap: 4px;
  background-color: var(--nav-divider);
  padding: 4px;
  border-radius: 8px;
}

.theme-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: 1;
  padding: 6px 4px;
  border: none;
  border-radius: 6px;
  background-color: transparent;
  color: var(--nav-text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    color: var(--nav-text);
    background-color: rgba(128, 128, 128, 0.15);
  }

  &.active {
    background-color: var(--nav-text-secondary);
    color: var(--nav-bg);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
}

.theme-icon {
  width: 14px;
  height: 14px;
}

.theme-text {
  font-size: 11px;
}

.theme-status {
  font-size: 11px;
  color: var(--nav-text-secondary);
  text-align: left;
  padding-left: 4px;
}
</style>
