<template>
  <div class="page-wrap flex flex-col of-hidden">
    <div class="page-header" flex flex-items-center flex-justify-between p12px border-b>
      <div flex flex-items-center gap8>
        <h3>面试机会</h3>
        <el-tag v-if="pagination.totalItemCount > 0" type="info" size="small">
          共 {{ pagination.totalItemCount }} 条记录
        </el-tag>
      </div>
      <div flex gap8 flex-items-center>
        <el-select v-model="filterStage" placeholder="全部阶段" size="small" clearable @change="handleFilterChange">
          <el-option
            v-for="item in stageOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <el-button size="small" @click="refresh">刷新</el-button>
      </div>
    </div>

    <div v-loading="isTableLoading" class="flex-1 of-hidden">
      <div ref="tableContainerEl" class="h-100% of-hidden">
        <ElTable
          ref="tableRef"
          :max-height="tableMaxHeight"
          :data="tableData"
          size="small"
          table-layout="auto"
          highlight-current-row
          stripe
          border
        >
          <ElTableColumn prop="bossName" label="BOSS" min-width="100" show-overflow-tooltip />
          <ElTableColumn prop="brandName" label="公司" min-width="120" show-overflow-tooltip />
          <ElTableColumn prop="jobName" label="职位" min-width="150" show-overflow-tooltip />
          <ElTableColumn prop="stage" label="面试阶段" min-width="120">
            <template #default="{ row }">
              <el-tag :type="getStageType(row.stage)" size="small">
                {{ getStageLabel(row.stage) }}
              </el-tag>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="interviewTime" label="面试时间" min-width="150">
            <template #default="{ row }">
              {{ row.interviewTime ? formatDate(row.interviewTime) : '-' }}
            </template>
          </ElTableColumn>
          <ElTableColumn prop="address" label="面试地址" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.address || '-' }}
            </template>
          </ElTableColumn>
          <ElTableColumn prop="notes" label="备注" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.notes || '-' }}
            </template>
          </ElTableColumn>
          <ElTableColumn prop="updatedAt" label="更新时间" min-width="150">
            <template #default="{ row }">
              {{ formatDate(row.updatedAt) }}
            </template>
          </ElTableColumn>
          <ElTableColumn label="操作" fixed="right" width="200" align="center">
            <template #default="{ row }">
              <ElButton link type="primary" size="small" @click="handleEdit(row)">编辑</ElButton>
              <ElButton link type="success" size="small" @click="handleOpenChat(row)">打开聊天</ElButton>
              <ElButton link type="danger" size="small" @click="handleDelete(row)">删除</ElButton>
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

    <!-- Edit Dialog -->
    <ElDialog v-model="editDialogVisible" title="编辑面试信息" width="550px">
      <ElForm :model="editForm" label-width="100px" size="small">
        <ElFormItem label="BOSS">
          <ElInput v-model="editForm.bossName" placeholder="请输入BOSS姓名" />
        </ElFormItem>
        <ElFormItem label="BOSS职位">
          <ElInput v-model="editForm.bossTitle" placeholder="请输入BOSS职位" />
        </ElFormItem>
        <ElFormItem label="公司">
          <ElInput v-model="editForm.brandName" placeholder="请输入公司名称" />
        </ElFormItem>
        <ElFormItem label="职位">
          <ElInput v-model="editForm.jobName" placeholder="请输入职位名称" />
        </ElFormItem>
        <ElFormItem label="面试阶段">
          <ElSelect v-model="editForm.stage" style="width: 100%">
            <ElOption
              v-for="item in stageOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="面试时间">
          <ElDatePicker
            v-model="editForm.interviewTime"
            type="datetime"
            placeholder="选择面试时间"
            style="width: 100%"
          />
        </ElFormItem>
        <ElFormItem label="面试地址">
          <ElInput v-model="editForm.address" placeholder="请输入面试地址" />
        </ElFormItem>
        <ElFormItem label="联系人">
          <ElInput v-model="editForm.contactName" placeholder="请输入联系人姓名" />
        </ElFormItem>
        <ElFormItem label="联系电话">
          <ElInput v-model="editForm.contactPhone" placeholder="请输入联系人电话" />
        </ElFormItem>
        <ElFormItem label="备注">
          <ElInput v-model="editForm.notes" type="textarea" :rows="3" placeholder="请输入备注" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton size="small" @click="editDialogVisible = false">取消</ElButton>
        <ElButton size="small" type="primary" @click="handleSaveEdit">保存</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ElTable, ElTableColumn, ElButton, ElPagination, ElDialog, ElTag, ElMessage, ElMessageBox, ElAvatar, ElSelect, ElOption, ElForm, ElFormItem, ElInput, ElDatePicker } from 'element-plus'
import type { VInterviewRecord } from '@dagegong/sqlite-plugin/dist/entity/VInterviewRecord'

// 面试阶段枚举
enum InterviewStage {
  PHONE_INTERVIEW = 'phone_interview',
  ONLINE_INTERVIEW = 'online_interview',
  ONSITE_INTERVIEW = 'onsite_interview',
  HR_INTERVIEW = 'hr_interview',
  OFFER_NEGOTIATION = 'offer_negotiation',
  OFFER_ACCEPTED = 'offer_accepted',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
}
import { PageReq, PagedRes } from '../../../../common/types/pagination'
import dayjs from 'dayjs'

// Stage options
const stageOptions = [
  { value: InterviewStage.PHONE_INTERVIEW, label: '电话面试', type: '' },
  { value: InterviewStage.ONLINE_INTERVIEW, label: '视频面试', type: 'info' },
  { value: InterviewStage.ONSITE_INTERVIEW, label: '现场面试', type: 'warning' },
  { value: InterviewStage.HR_INTERVIEW, label: 'HR面试', type: 'primary' },
  { value: InterviewStage.OFFER_NEGOTIATION, label: '谈薪阶段', type: 'success' },
  { value: InterviewStage.OFFER_ACCEPTED, label: '已接offer', type: 'success' },
  { value: InterviewStage.REJECTED, label: '未通过', type: 'danger' },
  { value: InterviewStage.WITHDRAWN, label: '已放弃', type: 'info' },
]

const getStageLabel = (stage: InterviewStage) => {
  return stageOptions.find(item => item.value === stage)?.label || stage
}

const getStageType = (stage: InterviewStage) => {
  return stageOptions.find(item => item.value === stage)?.type || ''
}

const formatDate = (date: string | Date) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

// Data
const tableData = ref<VInterviewRecord[]>([])
const pageSizeList = ref<number[]>([20, 50, 100, 200])
const pagination = ref<Omit<PageReq & PagedRes<unknown>, 'data'>>({
  pageNo: 1,
  pageSize: pageSizeList.value[0],
  totalItemCount: 0
})

const filterStage = ref<InterviewStage | ''>('')

const tableRef = ref<InstanceType<typeof ElTable>>()
const isTableLoading = ref(false)

// Edit dialog
const editDialogVisible = ref(false)
const editForm = ref({
  id: 0,
  bossName: '',
  bossTitle: '',
  brandName: '',
  jobName: '',
  stage: InterviewStage.PHONE_INTERVIEW,
  interviewTime: null as Date | null,
  address: '',
  contactName: '',
  contactPhone: '',
  notes: ''
})

// Load data
async function loadData() {
  try {
    isTableLoading.value = true
    const encryptUserId = await getCurrentUserId()
    
    const { data: res } = (await electron.ipcRenderer.invoke('get-interview-record-list', {
      pageNo: pagination.value.pageNo,
      pageSize: pagination.value.pageSize,
      stage: filterStage.value || undefined,
      encryptUserId
    })) as { data: PagedRes<VInterviewRecord> }
    
    tableData.value = res.data
    pagination.value = {
      totalItemCount: res.totalItemCount,
      pageNo: res.pageNo,
      pageSize: pagination.value.pageSize
    }
  } catch (err) {
    console.error(err)
    ElMessage.error('获取面试记录失败')
  } finally {
    isTableLoading.value = false
    setTimeout(() => {
      tableRef.value?.setScrollTop(0)
    }, 0)
  }
}

// Get current user ID
const getCurrentUserId = async () => {
  try {
    const userInfo = await electron.ipcRenderer.invoke('get-user-info')
    return userInfo?.encryptUserId || ''
  } catch {
    return ''
  }
}

// Refresh
function refresh() {
  pagination.value.pageNo = 1
  loadData()
}

// Filter change
function handleFilterChange() {
  pagination.value.pageNo = 1
  loadData()
}

// Page size change
const handlePageSizeChange = (newSize: number) => {
  pagination.value.pageSize = newSize
  pagination.value.pageNo = 1
  loadData()
}

// Edit
function handleEdit(row: VInterviewRecord) {
  editForm.value = {
    id: row.id,
    bossName: row.bossName || '',
    bossTitle: row.bossTitle || '',
    brandName: row.brandName || '',
    jobName: row.jobName || '',
    stage: row.stage,
    interviewTime: row.interviewTime ? new Date(row.interviewTime) : null,
    address: row.address || '',
    contactName: row.contactName || '',
    contactPhone: row.contactPhone || '',
    notes: row.notes || ''
  }
  editDialogVisible.value = true
}

// Save edit
async function handleSaveEdit() {
  try {
    await electron.ipcRenderer.invoke('update-interview-record', editForm.value.id, {
      bossName: editForm.value.bossName,
      bossTitle: editForm.value.bossTitle,
      brandName: editForm.value.brandName,
      jobName: editForm.value.jobName,
      stage: editForm.value.stage,
      interviewTime: editForm.value.interviewTime,
      address: editForm.value.address,
      contactName: editForm.value.contactName,
      contactPhone: editForm.value.contactPhone,
      notes: editForm.value.notes
    })
    ElMessage.success('保存成功')
    editDialogVisible.value = false
    loadData()
  } catch (err: any) {
    ElMessage.error(err.message || '保存失败')
  }
}

// Delete
async function handleDelete(row: VInterviewRecord) {
  try {
    await ElMessageBox.confirm('确定要删除这条面试记录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    
    await electron.ipcRenderer.invoke('delete-interview-record', row.id)
    ElMessage.success('删除成功')
    loadData()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err.message || '删除失败')
    }
  }
}

// Open chat
async function handleOpenChat(row: VInterviewRecord) {
  await electron.ipcRenderer.invoke('open-site-with-boss-cookie', {
    url: `https://www.zhipin.com/web/geek/chat?bossId=${row.encryptBossId}&jobId=${row.encryptJobId}`
  })
}

// Table height adaptive
const tableMaxHeight = ref<number | undefined>(undefined)
const tableContainerEl = ref<HTMLElement>()
const setTableMaxHeight = () =>
  (tableMaxHeight.value = tableContainerEl.value?.clientHeight ?? undefined)
let ro: ResizeObserver | null = null

onMounted(() => {
  loadData()
  setTableMaxHeight()
  ro = new ResizeObserver(() => setTableMaxHeight())
  if (tableContainerEl.value) {
    ro.observe(tableContainerEl.value)
  }
})

onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
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

:deep(.el-table) {
  font-size: 13px;
  
  .el-table__cell {
    padding: 8px 0;
  }
}
</style>
