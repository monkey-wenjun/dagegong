<template>
  <div class="page-wrap flex flex-col of-hidden">
    <div class="page-header" flex flex-items-center flex-justify-between p12px border-b>
      <div flex flex-items-center gap8>
        <h3>沟通记录</h3>
        <el-tag v-if="pagination.totalItemCount > 0" type="info" size="small">
          共 {{ pagination.totalItemCount }} 条记录
        </el-tag>
        <el-tag v-if="lastSyncTime" type="success" size="small">
          上次同步: {{ formatSyncTime(lastSyncTime) }}
        </el-tag>
        <el-tooltip
          v-if="autoSyncStatus.isEnabled && autoSyncStatus.nextSyncTime"
          placement="bottom"
          content="每5分钟自动同步一次"
        >
          <el-tag type="warning" size="small">
            <template #icon><i class="i-mdi-timer-outline" /></template>
            下次同步: {{ formatNextSyncTime(autoSyncStatus.nextSyncTime) }}
          </el-tag>
        </el-tooltip>
      </div>
      <div flex gap8 flex-items-center>
        <el-switch
          :model-value="autoSyncStatus.isEnabled"
          :loading="switchLoading"
          active-text="自动同步"
          inline-prompt
          @update:model-value="handleAutoSyncChange"
        />
        <el-button
          :loading="isSyncing"
          size="small"
          type="success"
          @click="handleSync"
        >
          <template #icon>
            <i class="i-mdi-sync" />
          </template>
          同步BOSS沟通记录
        </el-button>
        <el-button
          :loading="isTableLoading"
          size="small"
          @click="refresh"
        >刷新</el-button>
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
        <!-- BOSS沟通记录 -->
        <ElTable
          v-if="activeTab === 'boss'"
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
                <el-tag v-if="row.unreadCount > 0" type="danger" size="small">{{ row.unreadCount }}未读</el-tag>
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
          <ElTableColumn label="操作" fixed="right" width="150" align="center">
            <template #default="{ row }">
              <ElButton
                link
                type="primary"
                size="small"
                @click="handleOpenChat(row.encryptBossId, row.encryptJobId)"
              >打开聊天</ElButton>
              <ElButton
                link
                type="primary"
                size="small"
                @click="handleViewJobOnline(row.encryptJobId)"
              >查看职位</ElButton>
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
          <ElTableColumn prop="positionName" label="职位分类" min-width="100" show-overflow-tooltip />
          <ElTableColumn
            prop="date"
            label="开聊时间"
            min-width="150"
            sortable
            :formatter="
              (_row, _col, val) => val ? transformUtcDateToLocalDate(val).format('YYYY-MM-DD HH:mm:ss') : '-'
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
        <el-select v-model="pagination.pageSize" size="small" style="width: 90px" @change="handlePageSizeChange">
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { ElTable, ElTableColumn, ElButton, ElPagination, ElDrawer, ElTag, ElMessage, ElAvatar, ElSwitch, ElTooltip } from 'element-plus'
import { type VChatStartupLog } from '@dagegong/sqlite-plugin/src/entity/VChatStartupLog'
import { type VBossChatRelation } from '@dagegong/sqlite-plugin/src/entity/VBossChatRelation'
import { transformUtcDateToLocalDate } from '@dagegong/utils/date.mjs'
import { PageReq, PagedRes } from '../../../../common/types/pagination'
import JobInfoSnapshot from '../../features/JobInfoSnapshot/index.vue'
import { gtagRenderer } from '@renderer/utils/gtag'
import dayjs from 'dayjs'

// 标签页
const activeTab = ref<'boss' | 'auto'>('boss')
const bossRelationCount = ref(0)
const autoStartChatCount = ref(0)

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

// 获取当前用户ID
const getCurrentUserId = async () => {
  try {
    const userInfo = await electron.ipcRenderer.invoke('get-user-info')
    return userInfo?.encryptUserId || ''
  } catch {
    return ''
  }
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
    
    const { data: res } = (await electron.ipcRenderer.invoke('get-boss-chat-relation-list', {
      pageNo: pagination.value.pageNo,
      pageSize: pagination.value.pageSize,
      encryptUserId
    })) as { data: PagedRes<VBossChatRelation> }
    
    tableData.value = res.data
    pagination.value = {
      totalItemCount: res.totalItemCount,
      pageNo: res.pageNo,
      pageSize: pagination.value.pageSize
    }
    bossRelationCount.value = res.totalItemCount
  } catch (err) {
    console.error(err)
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
    const rows = (tableData.value as VBossChatRelation[]).map(row => [
      row.bossName,
      row.bossTitle || '-',
      row.brandName,
      row.jobName,
      row.lastText || '-',
      row.updateTime ? dayjs(row.updateTime).format('YYYY-MM-DD HH:mm:ss') : '-',
      row.unreadCount
    ])
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `BOSS沟通记录_${dayjs().format('YYYYMMDD_HHmmss')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } else {
    // 导出AI自动找工作记录
    const headers = ['公司', '职位名称', '职位分类', '开聊时间', '工作经验', '薪资', 'BOSS', 'BOSS身份']
    const rows = (tableData.value as VChatStartupLog[]).map(row => [
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
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
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

// 打开聊天
async function handleOpenChat(encryptBossId: string, encryptJobId: string) {
  await electron.ipcRenderer.invoke('open-site-with-boss-cookie', {
    url: `https://www.zhipin.com/web/geek/chat?bossId=${encryptBossId}&jobId=${encryptJobId}`
  })
}

// 查看线上职位
async function handleViewJobOnline(encryptJobId: string) {
  await electron.ipcRenderer.invoke('open-site-with-boss-cookie', {
    url: `https://www.zhipin.com/job_detail/${encryptJobId}.html`
  })
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
onMounted(() => {
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
  
  // 每次进入页面自动触发一次同步（只在BOSS沟通记录标签页）
  if (!hasAutoSynced.value && activeTab.value === 'boss') {
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
