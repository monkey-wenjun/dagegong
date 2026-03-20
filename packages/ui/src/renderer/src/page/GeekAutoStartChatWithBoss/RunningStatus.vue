<template>
  <div class="geek-auto-start-chat-with-boss__running-status">
    <FlyingCompanyLogoList class="flying-company-logo-list" />
    <div class="tip">
      <article>
        <h1 class="main-title">AI正在帮你找工作中</h1>
        <p>💬 正在为你开聊BOSS，请静候佳音</p>
        <p>📱 你可以在<b>手机</b> / <b>平板电脑</b>上，使用BOSS直聘App与为你开聊的BOSS聊天</p>
        <p>🍀 祝你求职顺利！</p>
      </article>
      <el-button type="danger" size="large" :disabled="isStopping" @click="handleStopButtonClick">结束任务</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import FlyingCompanyLogoList from '../../features/FlyingCompanyLogoList/index.vue'
import { ElMessage } from 'element-plus';
import { gtagRenderer } from '@renderer/utils/gtag'

const { ipcRenderer } = electron
const router = useRouter()

const handleStopButtonClick = async () => {
  gtagRenderer('gascwb_stop_button_clicked')
  ipcRenderer.invoke('stop-geek-auto-start-chat-with-boss')
}

const isStopping = ref(false)
const handleStopping = () => {
  gtagRenderer('gascwb_become_stopping')
  isStopping.value = true
}
ipcRenderer.once('geek-auto-start-chat-with-boss-stopping', handleStopping)

const handleStopped = () => {
  gtagRenderer('gascwb_become_stopped')
  router.replace('/main-layout/GeekAutoStartChatWithBoss')
}
ipcRenderer.once('geek-auto-start-chat-with-boss-stopped', handleStopped)

onUnmounted(() => {
  ipcRenderer.removeListener('geek-auto-start-chat-with-boss-stopped', handleStopped)
  ipcRenderer.removeListener('geek-auto-start-chat-with-boss-stopping', handleStopping)
})

onMounted(async () => {
  try {
    await electron.ipcRenderer.invoke('run-geek-auto-start-chat-with-boss')
  } catch (err) {
    if (err instanceof Error && err.message.includes('NEED_TO_CHECK_RUNTIME_DEPENDENCIES')) {
      gtagRenderer('gascwb_cannot_run_for_corrupt')
      ElMessage.error({
        message: `核心组件损坏，正在尝试修复`
      })
      router.replace('/')
    }
    console.error(err)
    gtagRenderer('gascwb_cannot_run_for_unknown_error', { err })
  }
})
</script>

<style scoped lang="scss">
.geek-auto-start-chat-with-boss__running-status {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  .tip {
    margin: 0 auto;
    margin-top: -15vh;
    max-width: 640px;
    padding: 40px 50px;
    border-radius: 24px;
    // 毛玻璃效果
    background: rgba(255, 255, 255, 0.75);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.5);
    
    // 深色模式适配
    @media (prefers-color-scheme: dark) {
      background: rgba(30, 30, 30, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    
    article {
      h1 {
        margin-top: 0;
        font-size: 1.8rem;
        margin-bottom: 1.5rem;
        
        &.main-title {
          font-size: 3.5rem;
          font-weight: 700;
          text-align: center;
          color: var(--primary-color, #00b2b2);
          margin-bottom: 2rem;
          letter-spacing: 2px;
          text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
          animation: pulse 2s ease-in-out infinite;
        }
      }
      
      @keyframes pulse {
        0%, 100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.85;
          transform: scale(1.02);
        }
      }
      p {
        margin: 0.8rem 0;
        line-height: 1.6;
        font-size: 1.05rem;
      }
    }
    
    .el-button {
      margin-top: 2rem;
      width: 100%;
      height: 50px;
      font-size: 1.1rem;
      border-radius: 12px;
      font-weight: 500;
    }
  }
  .flying-company-logo-list {
    position: absolute;
    inset: 0;
    z-index: -1;
    opacity: 0.35;
  }
}
</style>
