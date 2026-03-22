<template>
  <div class="page-wrap flex flex-col of-hidden">
    <div class="page-header" flex flex-items-center flex-justify-between p12px border-b>
      <div flex flex-items-center gap8>
        <h3>沟通记录</h3>
        <!-- 用户选择器 -->
        <el-select
          v-if="syncedUserList.length > 0"
          v-model="selectedUserId"
          size="small"
          style="width: 180px"
          placeholder="选择用户"
          @change="handleUserChange"
        >
          <el-option
            v-for="user in syncedUserList"
            :key="user.encryptUserId"
            :label="user.name"
            :value="user.encryptUserId"
          >
            <div flex flex-col>
              <span>{{ user.name }}</span>
              <span style="font-size: 12px; color: #999">
                {{ user.chatCount }}条记录 · {{ formatSyncTime(new Date(user.lastSyncTime)) }}
              </span>
            </div>
          </el-option>
        </el-select>
        <el-tag v-if="pagination.totalItemCount > 0" type="info" size="small">
          共 {{ pagination.totalItemCount }} 条记录
        </el-tag>
        <el-tag v-if="lastSyncTime" type="success" size="small">
          上次同步: {{ formatSyncTime(lastSyncTime) }}
        </el-tag>
        <div v-if="autoSyncStatus.isEnabled && autoSyncStatus.nextSyncTime" style="display: inline-block;">
          <el-tooltip
            placement="bottom"
            content="每5分钟自动同步一次"
          >
            <el-tag type="warning" size="small">
              <template #icon><i class="i-mdi-timer-outline" /></template>
              下次同步: {{ formatNextSyncTime(autoSyncStatus.nextSyncTime) }}
            </el-tag>
          </el-tooltip>
        </div>
      </div>
      <div flex gap8 flex-items-center>
        <el-switch
          :model-value="autoSyncStatus.isEnabled"
          :loading="switchLoading"
          active-text="自动同步"
          inline-prompt
          @update:model-value="handleAutoSyncChange"
        />
        <el-button :loading="isSyncing" size="small" type="success" @click="handleSync">
          <template #icon>
            <i class="i-mdi-sync" />
          </template>
          同步BOSS沟通记录
        </el-button>
        <el-button :loading="isTableLoading" size="small" @click="refresh">刷新</el-button>
        <el-button size="small" type="primary" @click="exportRecords">导出</el-button>
      </div>
    </div>

    <!-- 标签切换 -->
    <div class="tabs-container" px12px pt8px>
      <el-radio-group v-model="activeTab" size="small" @change="handleTabChange">
        <el-radio-button label="boss">BOSS沟通记录 ({{ bossRelationCount }})</el-radio-button>
        <el-radio-button label="auto">本应用开聊记录 ({{ autoStartChatCount }})</el-radio-button>
      </el-radio-group>
    </div>

    <div v-loading="isTableLoading" class="flex-1 of-hidden">
      <div ref="tableContainerEl" class="h-100% of-hidden">
        <!-- 空状态提示 -->
        <div
          v-if="!isTableLoading && activeTab === 'boss' && syncedUserList.length === 0"
          class="empty-state"
          style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;"
        >
          <div class="empty-icon" style="margin-bottom: 16px;">
            <i class="i-mdi-chat-outline" style="font-size: 64px; color: #dcdfe6" />
          </div>
          <div class="empty-text" style="margin-bottom: 8px; font-size: 16px; color: #606266;">
            暂无沟通记录
          </div>
          <div class="empty-desc" style="margin-bottom: 16px; font-size: 14px; color: #909399; text-align: center;">
            点击右上角"同步BOSS沟通记录"按钮，从BOSS直聘同步聊天记录到本地数据库
          </div>
          <el-button type="primary" :loading="isSyncing" @click="handleSync">
            <template #icon>
              <i class="i-mdi-sync" />
            </template>
            立即同步
          </el-button>
        </div>

        <!-- BOSS沟通记录 -->
        <ElTable
          v-if="activeTab === 'boss' && syncedUserList.length > 0"
          ref="tableRef"
          :max-height="tableMaxHeight"
          :data="tableData"
          :row-key="getRowKey"
          size="small"
          table-layout="auto"
          highlight-current-row
          stripe
          border
        >
          <ElTableColumn prop="bossName" label="BOSS" min-width="100" show-overflow-tooltip>
            <template #default="{ row }">
              <div flex items-center gap-2>
                <el-avatar :size="24" :src="row.bossAvatar" />
                <span>{{ row.bossName }}</span>
                <el-tag v-if="row.unreadCount > 0" type="danger" size="small"
                  >{{ row.unreadCount }}未读</el-tag
                >
                <el-tag v-if="row.isTop" type="warning" size="small">置顶</el-tag>
              </div>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="bossTitle" label="职位" min-width="120" show-overflow-tooltip />
          <ElTableColumn prop="brandName" label="公司" min-width="120" show-overflow-tooltip />
          <ElTableColumn prop="jobName" label="职位名称" min-width="150" show-overflow-tooltip />
          <ElTableColumn prop="lastText" label="最后消息" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <span :class="{ 'text-unread': row.unreadCount > 0 && !row.lastIsSelf }">
                {{ row.lastIsSelf ? '我: ' : '' }}{{ row.lastText || '-' }}
              </span>
            </template>
          </ElTableColumn>
          <ElTableColumn
            prop="updateTime"
            label="更新时间"
            min-width="150"
            :formatter="formatUpdateTime"
          />
          <ElTableColumn label="操作" fixed="right" width="260" align="center">
            <template #default="{ row }">
              <ElButton link type="primary" size="small" @click="handleOpenLocalChat(row)"
                >打开聊天</ElButton
              >
              <ElButton
                link
                type="primary"
                size="small"
                @click="handleViewJobOnline(row.encryptJobId)"
                >查看职位</ElButton
              >
              <ElButton link type="success" size="small" @click="handleMarkAsInterview(row)"
                >标记为面试</ElButton
              >
              <ElButton link type="danger" size="small" @click="handleBlockCompany(row)"
                >拉黑企业</ElButton
              >
            </template>
          </ElTableColumn>
        </ElTable>

        <!-- AI自动找工作记录 -->
        <ElTable
          v-else
          ref="tableRef"
          :max-height="tableMaxHeight"
          :data="tableData"
          :row-key="getRowKey"
          size="small"
          table-layout="auto"
          highlight-current-row
          stripe
          border
        >
          <ElTableColumn prop="companyName" label="公司" min-width="120" show-overflow-tooltip />
          <ElTableColumn prop="jobName" label="职位名称" min-width="150" show-overflow-tooltip />
          <ElTableColumn
            prop="positionName"
            label="职位分类"
            min-width="100"
            show-overflow-tooltip
          />
          <ElTableColumn
            prop="date"
            label="开聊时间"
            min-width="150"
            sortable
            :formatter="
              (_row, _col, val) =>
                val ? transformUtcDateToLocalDate(val).format('YYYY-MM-DD HH:mm:ss') : '-'
            "
          />
          <ElTableColumn prop="experienceName" label="工作经验" min-width="90" />
          <ElTableColumn
            label="薪资"
            min-width="100"
            :formatter="
              (row, _col, _val) =>
                row.salaryLow != null && row.salaryHigh != null
                  ? `${row.salaryLow}-${row.salaryHigh}k` +
                    (row.salaryMonth ? `* ${row.salaryMonth}薪` : '')
                  : '-'
            "
          />
          <ElTableColumn prop="bossName" label="BOSS" min-width="100" show-overflow-tooltip />
          <ElTableColumn prop="bossTitle" label="BOSS身份" min-width="100" show-overflow-tooltip />
          <ElTableColumn label="职位信息" fixed="right" :width="120">
            <template #default="{ row }">
              <ElButton
                link
                type="primary"
                size="small"
                @click="handleViewJobSnapshotButtonClick(row)"
                >快照</ElButton
              >
              <ElButton
                link
                type="primary"
                size="small"
                @click="handleViewJobOnline(row.encryptJobId)"
                >线上</ElButton
              >
            </template>
          </ElTableColumn>
        </ElTable>
      </div>
    </div>
    <div class="flex flex-0 flex-justify-between pt10px pb10px px12px">
      <div class="w100px">
        <el-select
          v-model="pagination.pageSize"
          size="small"
          style="width: 90px"
          @change="handlePageSizeChange"
        >
          <el-option
            v-for="size in pageSizeList"
            :key="size"
            :label="`${size}条/页`"
            :value="size"
          />
        </el-select>
      </div>
      <ElPagination
        v-model:current-page="pagination.pageNo"
        v-model:page-size="pagination.pageSize"
        :page-sizes="pageSizeList"
        small
        :disabled="isTableLoading"
        layout="total, prev, pager, next, jumper"
        :total="pagination.totalItemCount"
        @current-change="loadData"
      />
      <div class="w100px" />
    </div>
    <ElDrawer v-model="drawVisibleModelValue" size="400px">
      <JobInfoSnapshot
        v-if="selectedJobInfoForViewSnapshot"
        :job-info="selectedJobInfoForViewSnapshot"
        scene="startChatRecord"
        @closed="
          () => {
            gtagRenderer('start_chat_record_closed')
            selectedJobInfoForViewSnapshot = null
          }
        "
      />
    </ElDrawer>

    <!-- 聊天记录弹窗 -->
    <ChatHistoryDialog
      v-model="chatHistoryVisible"
      :boss-info="selectedChatBossInfo"
      :encrypt-user-id="currentUserId"
      :can-sync="true"
      @open-boss-chat="handleOpenBossChat"
      @view-job="handleViewJobOnline"
      @sync="handleChatHistorySynced"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import {
  ElTable,
  ElTableColumn,
  ElButton,
  ElPagination,
  ElDrawer,
  ElTag,
  ElMessage,
  ElMessageBox,
  ElAvatar,
  ElSwitch,
  ElTooltip
} from 'element-plus'
import { type VChatStartupLog } from '@dagegong/sqlite-plugin/dist/entity/VChatStartupLog.js'
import { type VBossChatRelation } from '@dagegong/sqlite-plugin/dist/entity/VBossChatRelation.js'
import { transformUtcDateToLocalDate } from '@dagegong/utils/date.mjs'
import { PageReq, PagedRes } from '../../../../common/types/pagination'
import JobInfoSnapshot from '../../features/JobInfoSnapshot/index.vue'
import ChatHistoryDialog from '../../components/ChatHistoryDialog.vue'
import { gtagRenderer } from '@renderer/utils/gtag'
import dayjs from 'dayjs'

// 标签页
const activeTab = ref<'boss' | 'auto'>('boss')
const bossRelationCount = ref(0)
const autoStartChatCount = ref(0)

// 用户选择
interface SyncedUser {
  encryptUserId: string
  name: string
  lastSyncTime: string
  chatCount: number
}
const syncedUserList = ref<SyncedUser[]>([])
const selectedUserId = ref<string>('')

// 加载已同步的用户列表
async function loadSyncedUserList() {
  try {
    const result = await electron.ipcRenderer.invoke('get-synced-user-list')
    if (result.success && result.data) {
      syncedUserList.value = result.data
      
      // 如果只有一个用户，自动选择
      if (result.data.length === 1 && !selectedUserId.value) {
        selectedUserId.value = result.data[0].encryptUserId
        currentUserId.value = result.data[0].encryptUserId
      }
    }
  } catch (err) {
    console.error('加载用户列表失败:', err)
  }
}

// 切换用户
function handleUserChange(userId: string) {
  currentUserId.value = userId
  pagination.value.pageNo = 1
  refresh()
}

// 数据
const tableData = ref<VChatStartupLog[] | VBossChatRelation[]>([])
const pageSizeList = ref<number[]>([20, 50, 100, 200])
const pagination = ref<Omit<PageReq & PagedRes<unknown>, 'data'>>({
  pageNo: 1,
  pageSize: pageSizeList.value[0],
  totalItemCount: 0
})

const getRowKey = (row: any) => {
  if (activeTab.value === 'boss') {
    return `${row.friendId}`
  }
  return `${row.encryptJobId}@${row.date}`
}

const tableRef = ref<InstanceType<typeof ElTable>>()
const isTableLoading = ref(false)
const isSyncing = ref(false)
const lastSyncTime = ref<Date | null>(null)

// 自动同步状态
interface AutoSyncStatus {
  isEnabled: boolean
  lastSyncTime: Date | null
  lastSyncResult: {
    success: boolean
    syncedCount: number
    error?: string
  } | null
  isRunning: boolean
  nextSyncTime: Date | null
}

const autoSyncStatus = ref<AutoSyncStatus>({
  isEnabled: false,
  lastSyncTime: null,
  lastSyncResult: null,
  isRunning: false,
  nextSyncTime: null
})

// 开关的临时状态，用于在操作完成前保持UI状态
const switchLoading = ref(false)

// 获取自动同步状态
async function loadAutoSyncStatus() {
  try {
    const status = await electron.ipcRenderer.invoke('get-auto-sync-status')
    autoSyncStatus.value = {
      ...status,
      lastSyncTime: status.lastSyncTime ? new Date(status.lastSyncTime) : null,
      nextSyncTime: status.nextSyncTime ? new Date(status.nextSyncTime) : null
    }
    // 如果有上次同步时间，同步到 lastSyncTime
    if (autoSyncStatus.value.lastSyncTime) {
      lastSyncTime.value = autoSyncStatus.value.lastSyncTime
    }
  } catch (err) {
    console.error('获取自动同步状态失败:', err)
  }
}

// 处理自动同步开关变化
async function handleAutoSyncChange(enabled: boolean) {
  switchLoading.value = true
  try {
    const status = await electron.ipcRenderer.invoke('set-auto-sync-enabled', enabled)
    autoSyncStatus.value = {
      ...status,
      lastSyncTime: status.lastSyncTime ? new Date(status.lastSyncTime) : null,
      nextSyncTime: status.nextSyncTime ? new Date(status.nextSyncTime) : null
    }
    ElMessage.success(enabled ? '已开启自动同步，每5分钟同步一次' : '已关闭自动同步')
  } catch (err) {
    console.error('设置自动同步失败:', err)
    ElMessage.error('设置失败')
    // 发生错误时不更新状态，开关保持原样
  } finally {
    switchLoading.value = false
  }
}

// 格式化下次同步时间
function formatNextSyncTime(date: Date | null): string {
  if (!date) return '--:--'
  const now = new Date()
  const diff = Math.ceil((date.getTime() - now.getTime()) / 1000 / 60)
  if (diff <= 0) return '即将同步'
  if (diff < 60) return `${diff}分钟后`
  return dayjs(date).format('HH:mm')
}

// 自动同步完成回调
electron.ipcRenderer.on('auto-sync-completed', (_, data) => {
  console.log('自动同步完成:', data)
  lastSyncTime.value = new Date(data.syncTime)
  autoSyncStatus.value.lastSyncTime = lastSyncTime.value
  autoSyncStatus.value.lastSyncResult = {
    success: true,
    syncedCount: data.syncedCount
  }
  // 刷新列表
  refresh()
  ElMessage.success(`自动同步成功，共 ${data.syncedCount} 条记录`)
})

// 自动同步失败回调
electron.ipcRenderer.on('auto-sync-failed', (_, data) => {
  console.log('自动同步失败:', data)
  autoSyncStatus.value.lastSyncResult = {
    success: false,
    syncedCount: 0,
    error: data.error
  }
})

// 定时器，每分钟刷新下次同步时间显示
let nextSyncTimer: NodeJS.Timeout | null = null

// 获取当前用户ID（优先使用选择的用户）
const getCurrentUserId = async () => {
  // 如果已经选择了用户，直接返回
  if (selectedUserId.value) {
    return selectedUserId.value
  }
  
  // 否则尝试从 user_info 表获取
  try {
    const userInfo = await electron.ipcRenderer.invoke('get-user-info')
    if (userInfo?.encryptUserId) {
      selectedUserId.value = userInfo.encryptUserId
      return userInfo.encryptUserId
    }
  } catch {
    // 忽略错误
  }
  
  return ''
}

// 加载数据
async function loadData() {
  if (activeTab.value === 'boss') {
    await getBossChatRelationList()
  } else {
    await getAutoStartChatRecord()
  }
}

// 加载两个标签页的数量统计（用于初始化显示）
async function loadTabCounts() {
  try {
    // 同时获取两个标签页的数量
    const encryptUserId = await getCurrentUserId()

    const [bossRes, autoRes] = await Promise.all([
      electron.ipcRenderer.invoke('get-boss-chat-relation-list', {
        pageNo: 1,
        pageSize: 1,
        encryptUserId
      }) as Promise<{ data: PagedRes<VBossChatRelation> }>,
      electron.ipcRenderer.invoke('get-auto-start-chat-record', {
        pageNo: 1,
        pageSize: 1
      }) as Promise<{ data: PagedRes<VChatStartupLog> }>
    ])

    bossRelationCount.value = bossRes.data.totalItemCount
    autoStartChatCount.value = autoRes.data.totalItemCount
  } catch (err) {
    console.error('加载标签数量失败:', err)
  }
}

// 获取BOSS沟通记录
async function getBossChatRelationList() {
  try {
    isTableLoading.value = true
    const encryptUserId = await getCurrentUserId()
    console.log('[DEBUG] 获取沟通记录，用户ID:', encryptUserId)

    const res = await electron.ipcRenderer.invoke('get-boss-chat-relation-list', {
      pageNo: pagination.value.pageNo,
      pageSize: pagination.value.pageSize,
      encryptUserId
    })
    console.log('[DEBUG] 沟通记录返回:', res)

    // res 应该是 { data, pageNo, totalItemCount }
    const data = res?.data || []
    const totalItemCount = res?.totalItemCount || 0
    const pageNo = res?.pageNo || 1
    
    console.log('[DEBUG] 处理后的数据:', {
      dataLength: data.length,
      totalItemCount: totalItemCount,
      pageNo: pageNo
    })

    tableData.value = data
    pagination.value = {
      totalItemCount: totalItemCount,
      pageNo: pageNo,
      pageSize: pagination.value.pageSize
    }
    bossRelationCount.value = totalItemCount
  } catch (err) {
    console.error('[DEBUG] 获取沟通记录失败:', err)
    ElMessage.error('获取沟通记录失败')
  } finally {
    isTableLoading.value = false
    setTimeout(() => {
      tableRef.value?.setScrollTop(0)
    }, 0)
  }
}

// 获取AI自动找工作记录
async function getAutoStartChatRecord() {
  try {
    isTableLoading.value = true
    const { data: res } = (await electron.ipcRenderer.invoke('get-auto-start-chat-record', {
      pageNo: pagination.value.pageNo,
      pageSize: pagination.value.pageSize
    })) as { data: PagedRes<VChatStartupLog> }

    tableData.value = res.data
    pagination.value = {
      totalItemCount: res.totalItemCount,
      pageNo: res.pageNo,
      pageSize: pagination.value.pageSize
    }
    autoStartChatCount.value = res.totalItemCount
  } catch (err) {
    console.error(err)
    ElMessage.error('获取开聊记录失败')
  } finally {
    isTableLoading.value = false
    setTimeout(() => {
      tableRef.value?.setScrollTop(0)
    }, 0)
  }
}

// 刷新
function refresh() {
  pagination.value.pageNo = 1
  loadData()
}

// 切换标签
function handleTabChange() {
  pagination.value.pageNo = 1
  loadData()
}

// 同步BOSS沟通记录
async function handleSync() {
  try {
    isSyncing.value = true

    const result = await electron.ipcRenderer.invoke('sync-boss-chat-relations')

    if (result.success) {
      ElMessage.success(`同步成功，共 ${result.data.syncedCount} 条沟通记录`)
      lastSyncTime.value = new Date(result.data.syncTime)
      // 同步成功后刷新用户列表（可能有新用户）
      await loadSyncedUserList()
      // 如果是第一次同步且只有一个用户，自动选择
      if (!selectedUserId.value && syncedUserList.value.length === 1) {
        selectedUserId.value = syncedUserList.value[0].encryptUserId
        currentUserId.value = syncedUserList.value[0].encryptUserId
      }
      refresh()
    } else {
      ElMessage.error(result.error || '同步失败')
    }
  } catch (err) {
    console.error(err)
    ElMessage.error('同步失败')
  } finally {
    isSyncing.value = false
  }
}

// 格式化更新时间
function formatUpdateTime(row: any, column: any, val: number) {
  if (!val) return '-'
  // 时间戳是毫秒还是秒
  const timestamp = val > 1000000000000 ? val : val * 1000
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')
}

// 格式化同步时间
function formatSyncTime(date: Date) {
  return dayjs(date).format('MM-DD HH:mm')
}

// 处理每页条数变化
const handlePageSizeChange = (newSize: number) => {
  pagination.value.pageSize = newSize
  pagination.value.pageNo = 1
  loadData()
}

// 导出记录
const exportRecords = () => {
  if (tableData.value.length === 0) {
    ElMessage.warning('没有可导出的数据')
    return
  }

  if (activeTab.value === 'boss') {
    // 导出BOSS沟通记录
    const headers = ['BOSS', '职位', '公司', '职位名称', '最后消息', '更新时间', '未读数']
    const rows = (tableData.value as VBossChatRelation[]).map((row) => [
      row.bossName,
      row.bossTitle || '-',
      row.brandName,
      row.jobName,
      row.lastText || '-',
      row.updateTime ? dayjs(row.updateTime).format('YYYY-MM-DD HH:mm:ss') : '-',
      row.unreadCount
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `BOSS沟通记录_${dayjs().format('YYYYMMDD_HHmmss')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } else {
    // 导出AI自动找工作记录
    const headers = [
      '公司',
      '职位名称',
      '职位分类',
      '开聊时间',
      '工作经验',
      '薪资',
      'BOSS',
      'BOSS身份'
    ]
    const rows = (tableData.value as VChatStartupLog[]).map((row) => [
      row.companyName || '-',
      row.jobName || '-',
      row.positionName || '-',
      row.date ? transformUtcDateToLocalDate(row.date).format('YYYY-MM-DD HH:mm:ss') : '-',
      row.experienceName || '-',
      row.salaryLow != null && row.salaryHigh != null
        ? `${row.salaryLow}-${row.salaryHigh}k` + (row.salaryMonth ? `* ${row.salaryMonth}薪` : '')
        : '-',
      row.bossName || '-',
      row.bossTitle || '-'
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `开聊记录_${dayjs().format('YYYYMMDD_HHmmss')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  gtagRenderer('start_chat_record_export')
  ElMessage.success('导出成功')
}

// 打开聊天（本地展示）
const chatHistoryVisible = ref(false)
const selectedChatBossInfo = ref<any>(null)
const currentUserId = ref('')

async function handleOpenLocalChat(row: VBossChatRelation) {
  console.log('[StartChatRecord] Opening chat for row:', row)

  // 获取当前用户ID（如果不为空，查询会更精确；为空也能查询）
  if (!currentUserId.value) {
    const userId = await getCurrentUserId()
    currentUserId.value = userId || ''
    console.log('[StartChatRecord] Got current user ID:', currentUserId.value || '(empty)')
  }

  console.log('[StartChatRecord] Current user ID:', currentUserId.value)

  selectedChatBossInfo.value = {
    encryptBossId: row.encryptBossId,
    bossName: row.bossName,
    bossTitle: row.bossTitle,
    bossAvatar: row.bossAvatar,
    encryptJobId: row.encryptJobId,
    jobName: row.jobName,
    brandName: row.brandName
  }
  chatHistoryVisible.value = true

  console.log('[StartChatRecord] Chat dialog opened with:', {
    bossInfo: selectedChatBossInfo.value,
    encryptUserId: currentUserId.value
  })
}

// 在 BOSS 中打开聊天
async function handleOpenBossChat(encryptBossId: string, encryptJobId?: string) {
  await electron.ipcRenderer.invoke('open-site-with-boss-cookie', {
    url: `https://www.zhipin.com/web/geek/chat?bossId=${encryptBossId}&jobId=${encryptJobId || ''}`
  })
}

// 聊天记录同步完成
function handleChatHistorySynced() {
  // 可以在这里做一些刷新操作
  console.log('聊天记录同步完成')
}

// 查看线上职位
async function handleViewJobOnline(encryptJobId: string) {
  await electron.ipcRenderer.invoke('open-site-with-boss-cookie', {
    url: `https://www.zhipin.com/job_detail/${encryptJobId}.html`
  })
}

// 标记为面试
async function handleMarkAsInterview(row: VBossChatRelation) {
  try {
    // Check if already in interview list
    const checkResult = await electron.ipcRenderer.invoke(
      'check-is-in-interview',
      row.encryptBossId,
      row.encryptJobId
    )
    if (checkResult.data) {
      ElMessage.warning('该职位已在面试列表中')
      return
    }

    // Confirm dialog
    await ElMessageBox.confirm(
      `确定将 "${row.brandName} - ${row.jobName}" 标记为面试机会吗？`,
      '标记为面试',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'info'
      }
    )

    // 获取当前用户ID（优先使用选择的用户）
    const userId = selectedUserId.value || (await getCurrentUserId())
    
    // Create interview record
    await electron.ipcRenderer.invoke('create-interview-record', {
      encryptBossId: row.encryptBossId,
      encryptJobId: row.encryptJobId,
      encryptUserId: userId,
      bossName: row.bossName,
      bossTitle: row.bossTitle,
      brandName: row.brandName,
      jobName: row.jobName,
      stage: 'phone_interview',
      source: 'from_chat',
      lastChatText: row.lastText,
      lastChatTime: row.lastTime ? new Date(row.lastTime) : null
    })

    ElMessage.success('已添加到面试列表')
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.message || '标记失败')
    }
  }
}

// 拉黑企业（添加到全局黑名单）
async function handleBlockCompany(row: VBossChatRelation) {
  try {
    if (!row.brandName) {
      ElMessage.warning('该公司信息不完整，无法拉黑')
      return
    }

    // 确认对话框
    await ElMessageBox.confirm(
      `确定将 "${row.brandName}" 加入全局黑名单吗？\n\n加入后：\n1. AI自动找工作时将避开该公司\n2. 已读不回自动复聊时不会提醒该公司\n3. 该公司将被全局屏蔽`,
      '拉黑企业',
      {
        confirmButtonText: '确定拉黑',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    // 获取当前配置
    const configResult = await electron.ipcRenderer.invoke('read-config-file', 'boss.json')
    const config = configResult || {}
    
    // 获取当前黑名单正则
    let currentBlockList = config.blockCompanyNameRegExpStr || ''
    
    // 转义正则特殊字符
    const escapeRegExp = (str: string) => {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
    
    const escapedCompanyName = escapeRegExp(row.brandName)
    
    // 检查是否已存在
    if (currentBlockList.includes(escapedCompanyName)) {
      ElMessage.warning(`"${row.brandName}" 已在黑名单中`)
      return
    }
    
    // 添加到黑名单（使用 | 分隔）
    const newBlockList = currentBlockList 
      ? `${currentBlockList}|${escapedCompanyName}`
      : escapedCompanyName
    
    // 保存配置
    await electron.ipcRenderer.invoke('write-config-file', 'boss.json', {
      ...config,
      blockCompanyNameRegExpStr: newBlockList
    })

    ElMessage.success(`已将 "${row.brandName}" 加入黑名单`)
    
    // 记录日志
    console.log('[BlockCompany] 已添加公司到黑名单:', {
      company: row.brandName,
      escapedName: escapedCompanyName,
      newBlockList
    })
  } catch (err: any) {
    if (err !== 'cancel') {
      console.error('[BlockCompany] 拉黑失败:', err)
      ElMessage.error(err.message || '拉黑失败')
    }
  }
}

// 查看快照
const drawVisibleModelValue = ref(false)
const selectedJobInfoForViewSnapshot = ref<VChatStartupLog | null>(null)

function handleViewJobSnapshotButtonClick(record: VChatStartupLog) {
  selectedJobInfoForViewSnapshot.value = record
  drawVisibleModelValue.value = true
}

// 是否已经自动同步过
const hasAutoSynced = ref(false)

// 表格高度自适应
const tableMaxHeight = ref<number | undefined>(undefined)
const tableContainerEl = ref<HTMLElement>()
const setTableMaxHeight = () =>
  (tableMaxHeight.value = tableContainerEl.value?.clientHeight ?? undefined)
let ro: ResizeObserver | null = null
onMounted(async () => {
  // 首先加载已同步的用户列表
  await loadSyncedUserList()
  
  loadData()
  loadTabCounts() // 加载两个标签页的数量
  loadAutoSyncStatus()
  setTableMaxHeight()
  ro = new ResizeObserver(() => setTableMaxHeight())
  if (tableContainerEl.value) {
    ro.observe(tableContainerEl.value)
  }
  // 启动下次同步时间刷新定时器
  nextSyncTimer = setInterval(() => {
    // 触发响应式更新
    if (autoSyncStatus.value.nextSyncTime) {
      autoSyncStatus.value.nextSyncTime = new Date(autoSyncStatus.value.nextSyncTime)
    }
  }, 60000) // 每分钟刷新一次

  // 每次进入页面自动触发一次同步（只在BOSS沟通记录标签页，且已选择用户时）
  if (!hasAutoSynced.value && activeTab.value === 'boss' && selectedUserId.value) {
    hasAutoSynced.value = true
    handleSync()
  }
})
onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
  if (nextSyncTimer) {
    clearInterval(nextSyncTimer)
    nextSyncTimer = null
  }
  // 移除 IPC 监听
  electron.ipcRenderer.removeAllListeners('auto-sync-completed')
  electron.ipcRenderer.removeAllListeners('auto-sync-failed')
  // 离开页面时重置自动同步标志，下次进入时仍然会触发
  hasAutoSynced.value = false
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

.tabs-container {
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-bottom: 8px;
}

:deep(.el-drawer) {
  .el-drawer__header {
    padding: 16px 20px;
    margin-bottom: 0;
  }
  .el-drawer__body {
    padding: 0;
    margin: 0 0 20px 20px;
    padding-right: 20px;
  }
}

:deep(.el-table) {
  font-size: 13px;

  .el-table__cell {
    padding: 8px 0;
  }
}

.text-unread {
  color: var(--el-color-danger);
  font-weight: 500;
}
</style>
