<template>
  <div class="page-wrap flex flex-col of-hidden">
    <div class="page-header" flex flex-items-center flex-justify-between p12px border-b>
      <div flex flex-items-center gap8>
        <h3>AI 自动回复</h3>
        <el-tag v-if="config.enabled" type="success" size="small">运行中</el-tag>
        <el-tag v-else type="info" size="small">已停止</el-tag>
      </div>
    </div>

    <div class="flex-1 of-auto p-4">
      <el-alert
        title="功能说明"
        description="开启后，系统会每30秒检查一次沟通记录。当检测到有HR发来新消息（未读且最后一条不是自己的消息）时，会自动调用Dify AI生成并发送回复。"
        type="info"
        show-icon
        :closable="false"
        class="mb-4"
      />

      <el-alert
        v-if="testReply && testReply.startsWith('❌')"
        :title="testReply"
        type="error"
        show-icon
        :closable="false"
        class="mb-4"
      >
        <template #default>
          <div class="mt-2">
            <p>常见问题和解决方案：</p>
            <ul class="ml-4 mt-1">
              <li>检查 API 地址是否正确（HTTP 默认端口 80）</li>
              <li>检查 API Key 是否有效</li>
              <li>检查 Dify 服务是否已启动</li>
              <li>检查网络连接是否正常</li>
            </ul>
          </div>
        </template>
      </el-alert>

      <el-card class="max-w-800px">
        <template #header>
          <div class="card-header">
            <span>基本配置</span>
            <el-switch
              v-model="config.enabled"
              :loading="isSaving"
              active-text="启用"
              inactive-text="停用"
              @change="handleToggle"
            />
          </div>
        </template>

        <el-form :model="config" label-width="100px" size="default">
          <el-form-item label="API 地址">
            <el-input v-model="config.apiUrl" placeholder="http://192.168.1.29/v1/chat-messages" />
          </el-form-item>

          <el-form-item label="API Key">
            <el-input
              v-model="config.apiKey"
              type="password"
              placeholder="请输入 Dify API Key"
              show-password
            />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" :loading="isSaving" @click="saveConfig"> 保存配置 </el-button>
            <el-button @click="loadConfig">重置</el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 测试区域 -->
      <el-card class="max-w-800px mt-4">
        <template #header>
          <div class="card-header">
            <span>测试 API</span>
          </div>
        </template>

        <el-form size="default">
          <el-form-item label="测试消息">
            <el-input
              v-model="testMessage"
              type="textarea"
              :rows="3"
              placeholder="输入HR的消息，测试AI回复效果..."
            />
          </el-form-item>

          <el-form-item v-if="testReply">
            <el-alert :title="testReply" type="success" :closable="false" />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" :loading="isTesting" @click="testApi"> 测试回复 </el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

interface AiAutoReplyConfig {
  enabled: boolean
  apiUrl: string
  apiKey: string
}

const defaultConfig: AiAutoReplyConfig = {
  enabled: false,
  apiUrl: 'http://192.168.1.29/v1/chat-messages',  // HTTP 默认端口 80
  apiKey: ''
}

const config = ref<AiAutoReplyConfig>({ ...defaultConfig })
const isSaving = ref(false)
const isTesting = ref(false)
const testMessage = ref('你好，我对这个职位很感兴趣')
const testReply = ref('')

// 加载配置
async function loadConfig() {
  try {
    const result = await electron.ipcRenderer.invoke('get-ai-auto-reply-config')
    config.value = { ...defaultConfig, ...result }
  } catch (err) {
    console.error('加载配置失败:', err)
    ElMessage.error('加载配置失败')
  }
}

// 保存配置
async function saveConfig() {
  if (!config.value.apiUrl) {
    ElMessage.warning('请填写 API 地址')
    return
  }
  if (!config.value.apiKey) {
    ElMessage.warning('请填写 API Key')
    return
  }

  isSaving.value = true
  try {
    await electron.ipcRenderer.invoke('save-ai-auto-reply-config', {
      apiUrl: config.value.apiUrl,
      apiKey: config.value.apiKey
    })
    ElMessage.success('配置保存成功')
  } catch (err) {
    console.error('保存配置失败:', err)
    ElMessage.error('保存配置失败')
  } finally {
    isSaving.value = false
  }
}

// 启用/禁用
async function handleToggle(enabled: boolean) {
  // 开启前检查必填项
  if (enabled) {
    if (!config.value.apiUrl) {
      ElMessage.warning('请填写 API 地址')
      config.value.enabled = false
      return
    }
    if (!config.value.apiKey) {
      ElMessage.warning('请填写 API Key')
      config.value.enabled = false
      return
    }
  }

  isSaving.value = true
  try {
    console.log('[AiAutoReply] 正在', enabled ? '启动' : '停止', '服务...')
    const result = await electron.ipcRenderer.invoke('set-ai-auto-reply-enabled', enabled)
    console.log('[AiAutoReply] 操作结果:', result)
    ElMessage.success(enabled ? '服务已启动' : '服务已停止')
  } catch (err: any) {
    console.error('[AiAutoReply] 操作失败:', err)
    const errorMsg = err?.message || err?.toString() || '未知错误'
    ElMessage.error(`操作失败: ${errorMsg}`)
    // 恢复开关状态
    config.value.enabled = !enabled
  } finally {
    isSaving.value = false
  }
}

// 解析 Dify streaming 响应
async function parseStreamingResponse(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('无法读取响应流')
  }

  let fullAnswer = ''
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    const lines = chunk.split('\n')

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          // Dify streaming 格式
          if (parsed.answer) {
            fullAnswer = parsed.answer
          } else if (parsed.event === 'message' && parsed.data?.answer) {
            fullAnswer = parsed.data.answer
          }
        } catch {
          // 忽略解析失败的行
        }
      }
    }
  }

  return fullAnswer
}

// 测试 API
async function testApi() {
  if (!config.value.apiUrl) {
    ElMessage.warning('请填写 API 地址')
    return
  }
  if (!config.value.apiKey) {
    ElMessage.warning('请填写 API Key')
    return
  }
  if (!testMessage.value.trim()) {
    ElMessage.warning('请输入测试消息')
    return
  }

  isTesting.value = true
  testReply.value = '请求中...'

  console.log('[AiAutoReply] 测试 API:', config.value.apiUrl)
  console.log('[AiAutoReply] 测试消息:', testMessage.value)

  // 先尝试 blocking 模式
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    console.log('[AiAutoReply] 尝试 blocking 模式...')

    const response = await fetch(config.value.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.value.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: {},
        query: testMessage.value,
        response_mode: 'blocking',
        conversation_id: '',
        user: 'test'
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP ${response.status}: ${errorText || '请求失败'}`)
    }

    const contentType = response.headers.get('content-type') || ''
    console.log('[AiAutoReply] 响应类型:', contentType)

    if (contentType.includes('text/event-stream') || contentType.includes('application/stream')) {
      // 服务器返回了 streaming 响应
      console.log('[AiAutoReply] 检测到 streaming 响应，解析中...')
      testReply.value = '解析流式响应...'
      const answer = await parseStreamingResponse(response)
      if (answer) {
        testReply.value = answer
        ElMessage.success('测试成功 (streaming)')
      } else {
        throw new Error('无法从流式响应中解析答案')
      }
    } else {
      // 普通 JSON 响应
      const data = await response.json()
      console.log('[AiAutoReply] 响应数据:', data)

      if (data.answer) {
        testReply.value = data.answer
        ElMessage.success('测试成功 (blocking)')
      } else if (data.message) {
        throw new Error(data.message)
      } else {
        testReply.value = `响应: ${JSON.stringify(data, null, 2)}`
        ElMessage.warning('未找到 answer 字段')
      }
    }
  } catch (err: any) {
    console.error('[AiAutoReply] 测试失败:', err)
    let errorMsg = '未知错误'

    if (err.name === 'AbortError') {
      errorMsg = '请求超时，请检查 API 地址是否正确'
    } else if (err instanceof Error) {
      errorMsg = err.message
    } else {
      errorMsg = String(err)
    }

    testReply.value = `❌ 错误: ${errorMsg}`
    ElMessage.error(`测试失败: ${errorMsg}`)
  } finally {
    isTesting.value = false
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<style scoped lang="scss">
.page-wrap {
  max-height: 100vh;
  overflow: hidden;
  padding-left: 20px;
  padding-right: 20px;
  padding-top: 20px;
  width: 100%;
}

.page-header {
  border-bottom: 1px solid var(--el-border-color-lighter);

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
  }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.max-w-800px {
  max-width: 800px;
}

.mt-4 {
  margin-top: 16px;
}
</style>
