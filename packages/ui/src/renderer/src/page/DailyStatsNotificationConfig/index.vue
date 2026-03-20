<template>
  <div class="daily-stats-notification-config">
    <div class="scroll-container">
      <div class="form-wrap">
        <div mb20px font-size-18px font-bold>每日统计通知设置</div>
        <div font-size-14px color-#666 mb20px>
          配置每日沟通统计的定时推送通知，支持飞书、钉钉机器人
        </div>
        
        <el-form
          ref="formRef"
          :model="formContent"
          label-position="top"
          class="notification-form"
        >
          <el-form-item>
            <template #label>
              <div flex items-center gap-8px>
                <span>启用通知</span>
                <el-tooltip content="开启后将在指定时间自动推送当日沟通统计" placement="right">
                  <el-icon><QuestionFilled /></el-icon>
                </el-tooltip>
              </div>
            </template>
            <el-switch
              v-model="formContent.dailyStatsNotificationEnabled"
              active-text="开启"
              inactive-text="关闭"
            />
          </el-form-item>

          <template v-if="formContent.dailyStatsNotificationEnabled">
            <el-form-item label="通知类型">
              <el-radio-group v-model="formContent.dailyStatsNotificationType">
                <el-radio-button label="feishu">
                  <div flex items-center gap-4px>
                    <i class="i-mdi-chat-processing" />
                    飞书机器人
                  </div>
                </el-radio-button>
                <el-radio-button label="dingtalk">
                  <div flex items-center gap-4px>
                    <i class="i-mdi-chat" />
                    钉钉机器人
                  </div>
                </el-radio-button>
              </el-radio-group>
            </el-form-item>

            <el-form-item>
              <template #label>
                <div flex items-center gap-8px>
                  <span>Webhook 地址</span>
                  <el-tooltip placement="right">
                    <template #content>
                      <div w-300px>
                        <p>飞书：在群设置中添加自定义机器人，复制 Webhook 地址</p>
                        <p mt-8px>钉钉：在群设置中添加机器人，复制 Webhook 地址</p>
                      </div>
                    </template>
                    <el-icon><QuestionFilled /></el-icon>
                  </el-tooltip>
                </div>
              </template>
              <el-input
                v-model="formContent.dailyStatsWebhookUrl"
                :placeholder="webhookPlaceholder"
                clearable
                show-word-limit
                maxlength="500"
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
              <div font-size-12px color-#999 mt-8px>
                每天将按照设定时间自动推送当日统计数据
              </div>
            </el-form-item>

            <el-form-item>
              <template #label>
                <div flex items-center gap-8px>
                  <span>消息模板</span>
                  <el-tooltip placement="right">
                    <template #content>
                      <div w-300px>
                        <p>可用变量：</p>
                        <ul mt-4px>
                          <li><code>{resumeCount}</code> - 今日投递简历数</li>
                          <li><code>{bossCount}</code> - 今日沟通BOSS数</li>
                        </ul>
                      </div>
                    </template>
                    <el-icon><QuestionFilled /></el-icon>
                  </el-tooltip>
                </div>
              </template>
              <el-input
                v-model="formContent.dailyStatsTemplate"
                type="textarea"
                :autosize="{ minRows: 3, maxRows: 5 }"
                placeholder="请输入消息模板"
                show-word-limit
                maxlength="200"
              />
              <div font-size-12px color-#999 mt-8px>
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
                <template #icon>
                  <i class="i-mdi-send" />
                </template>
                测试发送
              </el-button>
            </el-form-item>

            <el-divider />

            <el-form-item label="今日统计预览">
              <div class="stats-preview" flex gap-20px>
                <div class="stat-card" flex-1 text-center p-16px bg-#f5f7fa border-rd-8px>
                  <div font-size-28px font-bold color-primary>{{ todayStats.resumeCount }}</div>
                  <div font-size-12px color-#666 mt-4px>今日投递简历</div>
                </div>
                <div class="stat-card" flex-1 text-center p-16px bg-#f5f7fa border-rd-8px>
                  <div font-size-28px font-bold color-primary>{{ todayStats.bossCount }}</div>
                  <div font-size-12px color-#666 mt-4px>今日沟通BOSS</div>
                </div>
              </div>
              <div font-size-12px color-#999 mt-8px>
                数据仅供参考，实际推送时将使用最新统计数据
              </div>
            </el-form-item>
          </template>
        </el-form>
      </div>
    </div>
    
    <div class="pb10px pt10px form-footer-bar">
      <div
        :style="{
          display: 'flex',
          justifyContent: 'end',
          maxWidth: '800px',
          margin: '0 auto',
          paddingLeft: '20px',
          paddingRight: 'calc(20px + 16px)'
        }"
      >
        <el-button @click="handleCancel">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
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

// 今日统计（预览用）
const todayStats = ref({
  resumeCount: 0,
  bossCount: 0
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
    .replace(/\{\{resumeCount\}\}/g, String(todayStats.value.resumeCount || 5))
    .replace(/\{\{bossCount\}\}/g, String(todayStats.value.bossCount || 3))
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
    
    setTimeout(() => {
      window.history.back()
    }, 500)
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

// 加载配置和今日统计
onMounted(async () => {
  try {
    // 加载配置
    const config = await ipcRenderer.invoke('get-daily-stats-notification-config')
    if (config) {
      Object.keys(formContent.value).forEach((key) => {
        if (key in config) {
          formContent.value[key] = config[key]
        }
      })
    }
    
    // 加载今日统计预览
    const stats = await ipcRenderer.invoke('get-today-stats-preview')
    if (stats) {
      todayStats.value = stats
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
  height: 100%;
  min-height: 100%;
  width: 100%;

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
  }

  .notification-form {
    :deep(.el-form-item__label) {
      font-weight: 500;
      padding-bottom: 8px;
    }
  }

  .stats-preview {
    .stat-card {
      transition: all 0.3s ease;
      
      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }
    }
  }
}

.form-footer-bar {
  flex: 0;
  background-color: var(--bg-secondary, #f8f8f8);
  border-top: 1px solid var(--border-secondary);
}

:deep(.el-radio-button__inner) {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
