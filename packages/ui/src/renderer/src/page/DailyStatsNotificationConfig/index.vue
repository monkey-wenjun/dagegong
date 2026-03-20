<template>
  <div class="daily-stats-notification-config">
    <div class="scroll-container">
      <div class="form-wrap">
        <h2>配置通知</h2>
        <p class="desc">配置每日沟通统计的定时推送通知，支持飞书、钉钉机器人</p>
        
        <el-form
          ref="formRef"
          :model="formContent"
          label-position="top"
          class="notification-form"
        >
          <el-form-item label="启用通知">
            <el-switch
              v-model="formContent.dailyStatsNotificationEnabled"
              active-text="开启"
              inactive-text="关闭"
            />
          </el-form-item>

          <div v-show="formContent.dailyStatsNotificationEnabled" style="width: 100%;">
            <el-form-item label="通知类型">
              <el-radio-group v-model="formContent.dailyStatsNotificationType">
                <el-radio-button label="feishu">飞书机器人</el-radio-button>
                <el-radio-button label="dingtalk">钉钉机器人</el-radio-button>
              </el-radio-group>
            </el-form-item>

            <el-form-item label="Webhook 地址">
              <el-input
                v-model="formContent.dailyStatsWebhookUrl"
                :placeholder="webhookPlaceholder"
                clearable
              />
            </el-form-item>

            <el-form-item label="推送时间">
              <el-time-select
                v-model="formContent.dailyStatsPushTime"
                :picker-options="{
                  start: '18:00',
                  step: '00:30',
                  end: '23:30'
                }"
                placeholder="选择推送时间"
                style="width: 200px"
              />
            </el-form-item>

            <el-form-item label="消息模板">
              <el-input
                v-model="formContent.dailyStatsTemplate"
                type="textarea"
                :autosize="{ minRows: 3, maxRows: 5 }"
                placeholder="请输入消息模板"
                maxlength="200"
                show-word-limit
              />
              <div class="preview-text">
                预览：{{ previewMessage }}
              </div>
            </el-form-item>

            <el-form-item>
              <el-button 
                type="primary" 
                plain
                @click="testNotification" 
                :loading="testingNotification"
                :disabled="!formContent.dailyStatsWebhookUrl"
              >
                测试发送
              </el-button>
            </el-form-item>
          </div>
        </el-form>
      </div>
    </div>
    
    <div class="form-footer-bar">
      <div class="footer-content">
        <el-button @click="handleCancel">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { gtagRenderer as baseGtagRenderer } from '@renderer/utils/gtag'

const { ipcRenderer } = window.electron
const gtagRenderer = (name, params?: object) => {
  return baseGtagRenderer(name, {
    scene: 'daily_stats_notification_config',
    ...params
  })
}

// 表单数据
const formContent = ref({
  dailyStatsNotificationEnabled: false,
  dailyStatsNotificationType: 'feishu' as 'feishu' | 'dingtalk',
  dailyStatsWebhookUrl: '',
  dailyStatsPushTime: '20:00',
  dailyStatsTemplate: '您今日已投递简历{{resumeCount}}份，与{{bossCount}}位BOSS进行沟通'
})

const formRef = ref()
const saving = ref(false)
const testingNotification = ref(false)

// Webhook 占位符
const webhookPlaceholder = computed(() => {
  return formContent.value.dailyStatsNotificationType === 'feishu'
    ? 'https://open.feishu.cn/open-apis/bot/v2/hook/xxx'
    : 'https://oapi.dingtalk.com/robot/send?access_token=xxx'
})

// 消息预览
const previewMessage = computed(() => {
  const template = formContent.value.dailyStatsTemplate || '您今日已投递简历{{resumeCount}}份，与{{bossCount}}位BOSS进行沟通'
  return template
    .replace(/\{\{resumeCount\}\}/g, '5')
    .replace(/\{\{bossCount\}\}/g, '3')
})

// 测试通知
async function testNotification() {
  if (!formContent.value.dailyStatsWebhookUrl) {
    ElMessage.warning('请先填写 Webhook 地址')
    return
  }
  
  testingNotification.value = true
  try {
    const result = await ipcRenderer.invoke('test-daily-stats-notification', {
      type: formContent.value.dailyStatsNotificationType,
      webhookUrl: formContent.value.dailyStatsWebhookUrl,
      template: formContent.value.dailyStatsTemplate
    })
    
    if (result.success) {
      ElMessage.success('测试消息发送成功，请检查群消息')
      gtagRenderer('test_notification_success')
    } else {
      ElMessage.error('发送失败：' + result.error)
      gtagRenderer('test_notification_failed', { error: result.error })
    }
  } catch (error) {
    ElMessage.error('发送失败：' + (error?.message || '未知错误'))
  } finally {
    testingNotification.value = false
  }
}

// 取消
function handleCancel() {
  window.history.back()
}

// 保存
async function handleSave() {
  saving.value = true
  try {
    await ipcRenderer.invoke('save-daily-stats-notification-config', {
      ...formContent.value
    })
    
    ElMessage.success({
      message: '保存成功',
      duration: 1500
    })
    gtagRenderer('config_saved')
  } catch (error) {
    ElMessage.error({
      message: '保存失败：' + (error?.message || '未知错误'),
      duration: 3000
    })
    console.error('Save failed:', error)
  } finally {
    saving.value = false
  }
}

// 加载配置
onMounted(async () => {
  try {
    const config = await ipcRenderer.invoke('get-daily-stats-notification-config')
    if (config) {
      Object.keys(formContent.value).forEach((key) => {
        if (key in config) {
          formContent.value[key] = config[key]
        }
      })
    }
  } catch (err) {
    console.error('Failed to load config:', err)
  }
})
</script>

<style lang="scss" scoped>
.daily-stats-notification-config {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  background-color: var(--bg-primary, #fff);

  .scroll-container {
    flex: 1;
    overflow: auto;
    width: 100%;
  }

  .form-wrap {
    max-width: 800px;
    width: 100%;
    padding: 30px 20px;
    margin-left: auto;
    margin-right: auto;
    background: var(--bg-primary);
    min-height: 500px;
  }

  h2 {
    margin: 0 0 10px 0;
    font-size: 18px;
    font-weight: bold;
  }

  .desc {
    color: #666;
    margin-bottom: 20px;
    font-size: 14px;
  }

  .preview-text {
    font-size: 12px;
    color: #999;
    margin-top: 8px;
  }
}

.form-footer-bar {
  flex: 0;
  background-color: var(--bg-secondary, #f8f8f8);
  border-top: 1px solid var(--border-secondary);
  padding: 10px 0;

  .footer-content {
    display: flex;
    justify-content: flex-end;
    max-width: 800px;
    margin: 0 auto;
    padding-left: 20px;
    padding-right: 36px;
  }
}
</style>
