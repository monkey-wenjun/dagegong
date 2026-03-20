<template>
  <div class="statistics-dashboard">
    <div class="page-header">
      <h2 class="page-title">数据统计</h2>
      <el-radio-group v-model="timeRange" size="small" @change="handleTimeRangeChange">
        <el-radio-button label="today">今日</el-radio-button>
        <el-radio-button label="week">最近一周</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-container">
      <el-skeleton :rows="5" animated />
    </div>

    <template v-else>
      <!-- 无数据提示 -->
      <el-empty v-if="!hasData" description="暂无统计数据，请先运行AI自动找工作功能">
        <el-button type="primary" @click="$router.push('/main-layout/GeekAutoStartChatWithBoss')">
          去运行
        </el-button>
      </el-empty>
      
      <!-- 概览卡片 -->
      <div v-else class="overview-cards">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon stat-icon-blue">
            <el-icon><ChatDotRound /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ overviewData.chatCount }}</div>
            <div class="stat-label">
              BOSS沟通记录
              <el-tooltip content="BOSS主动发起的沟通记录数（来自BOSS直聘沟通列表）">
                <el-icon style="font-size: 12px; margin-left: 2px; color: var(--text-secondary);"><QuestionFilled /></el-icon>
              </el-tooltip>
            </div>
            <div class="stat-sub" v-if="overviewData.chatDistinctCount > 0">
              涉及 {{ overviewData.chatDistinctCount }} 个职位
            </div>
          </div>
        </el-card>
        
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon stat-icon-orange">
            <el-icon><User /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ overviewData.bossCount }}</div>
            <div class="stat-label">沟通BOSS数</div>
          </div>
        </el-card>
        
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon stat-icon-green">
            <el-icon><OfficeBuilding /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ overviewData.companyCount }}</div>
            <div class="stat-label">沟通公司数</div>
          </div>
        </el-card>
        
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon stat-icon-red">
            <el-icon><CircleClose /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ overviewData.notSuitCount }}</div>
            <div class="stat-label">标记不合适</div>
          </div>
        </el-card>
      </div>

      <!-- 图表区域 -->
      <div class="charts-grid">
        <!-- 职位沟通排行 -->
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="chart-header">
              <span class="chart-title">职位沟通排行 TOP10</span>
            </div>
          </template>
          <div v-if="!statsData?.jobRank?.length" class="chart-empty">
            <el-empty description="暂无数据" :image-size="80" />
          </div>
          <div v-else ref="jobChartRef" class="chart-container"></div>
        </el-card>

        <!-- 公司沟通排行 -->
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="chart-header">
              <span class="chart-title">公司沟通排行 TOP10</span>
            </div>
          </template>
          <div v-if="!statsData?.companyRank?.length" class="chart-empty">
            <el-empty description="暂无数据" :image-size="80" />
          </div>
          <div v-else ref="companyChartRef" class="chart-container"></div>
        </el-card>

        <!-- 不合适原因分布 -->
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="chart-header">
              <span class="chart-title">不合适原因分布</span>
            </div>
          </template>
          <div v-if="!statsData?.notSuitReasons?.length" class="chart-empty">
            <el-empty description="暂无数据" :image-size="80" />
          </div>
          <div v-else ref="reasonChartRef" class="chart-container"></div>
        </el-card>

        <!-- 薪资范围分布 -->
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="chart-header">
              <span class="chart-title">薪资范围分布</span>
            </div>
          </template>
          <div v-if="!statsData?.salaryRanges?.length" class="chart-empty">
            <el-empty description="暂无数据，需要同步职位信息" :image-size="80" />
          </div>
          <div v-else ref="salaryChartRef" class="chart-container"></div>
        </el-card>

        <!-- 公司行业分布 -->
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="chart-header">
              <span class="chart-title">公司行业分布 TOP10</span>
            </div>
          </template>
          <div v-if="!statsData?.industries?.length" class="chart-empty">
            <el-empty description="暂无数据，需要同步公司信息" :image-size="80" />
          </div>
          <div v-else ref="industryChartRef" class="chart-container"></div>
        </el-card>

        <!-- 公司规模分布 -->
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="chart-header">
              <span class="chart-title">公司规模分布</span>
            </div>
          </template>
          <div v-if="!statsData?.scales?.length" class="chart-empty">
            <el-empty description="暂无数据，需要同步公司信息" :image-size="80" />
          </div>
          <div v-else ref="scaleChartRef" class="chart-container"></div>
        </el-card>

        <!-- 融资情况分布 -->
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="chart-header">
              <span class="chart-title">融资情况分布</span>
            </div>
          </template>
          <div v-if="!statsData?.stages?.length" class="chart-empty">
            <el-empty description="暂无数据，需要同步公司信息" :image-size="80" />
          </div>
          <div v-else ref="stageChartRef" class="chart-container"></div>
        </el-card>

        <!-- 热门职位 -->
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="chart-header">
              <span class="chart-title">热门职位 TOP15</span>
            </div>
          </template>
          <div v-if="!statsData?.jobNames?.length" class="chart-empty">
            <el-empty description="暂无数据" :image-size="80" />
          </div>
          <div v-else ref="jobNameChartRef" class="chart-container"></div>
        </el-card>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { ChatDotRound, User, OfficeBuilding, CircleClose, QuestionFilled } from '@element-plus/icons-vue'

const { ipcRenderer } = window.electron

// 动态导入 echarts（避免 SSR 问题）
let echarts: any = null

// 时间范围
const timeRange = ref<'today' | 'week'>('today')

// 加载状态
const loading = ref(true)

// 概览数据
const overviewData = ref({
  chatCount: 0,
  chatDistinctCount: 0,
  bossCount: 0,
  companyCount: 0,
  notSuitCount: 0
})

// 图表数据
const statsData = ref<any>(null)

// 是否有数据
const hasData = computed(() => {
  if (!statsData.value) return false
  return statsData.value.overview.chatCount > 0 || 
         statsData.value.overview.notSuitCount > 0
})

// 图表实例
const jobChartRef = ref<HTMLElement>()
const companyChartRef = ref<HTMLElement>()
const reasonChartRef = ref<HTMLElement>()
const salaryChartRef = ref<HTMLElement>()
const industryChartRef = ref<HTMLElement>()
const scaleChartRef = ref<HTMLElement>()
const stageChartRef = ref<HTMLElement>()
const jobNameChartRef = ref<HTMLElement>()

let jobChart: any = null
let companyChart: any = null
let reasonChart: any = null
let salaryChart: any = null
let industryChart: any = null
let scaleChart: any = null
let stageChart: any = null
let jobNameChart: any = null

// 检测当前主题
function isDarkTheme(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark'
}

// 获取图表主题色
function getChartColors() {
  const isDark = isDarkTheme()
  return {
    textColor: isDark ? '#e0e0e0' : '#333',
    axisColor: isDark ? '#555' : '#ccc',
    splitLineColor: isDark ? '#333' : '#eee',
    backgroundColor: 'transparent'
  }
}

// 获取统计数据
async function fetchStatistics() {
  loading.value = true
  console.log('[Statistics] Fetching data for range:', timeRange.value)
  
  try {
    // 先获取数据
    const data = await ipcRenderer.invoke('get-statistics-dashboard-data', {
      timeRange: timeRange.value
    })
    
    console.log('[Statistics] Data received:', data)
    statsData.value = data
    overviewData.value = {
      chatCount: data.overview?.chatCount || 0,
      chatDistinctCount: data.overview?.chatDistinctCount || 0,
      bossCount: data.overview?.bossCount || 0,
      companyCount: data.overview?.companyCount || 0,
      notSuitCount: data.overview?.notSuitCount || 0
    }
    
    // 延迟加载 echarts
    if (!echarts) {
      console.log('[Statistics] Loading echarts...')
      echarts = await import('echarts')
      console.log('[Statistics] Echarts loaded')
    }
    
    await nextTick()
    
    // 延迟初始化图表，确保 DOM 已渲染
    setTimeout(() => {
      initCharts()
    }, 100)
  } catch (error) {
    console.error('[Statistics] Failed to fetch statistics:', error)
    ElMessage.error('获取统计数据失败：' + (error?.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

// 初始化图表
function initCharts() {
  if (!statsData.value || !echarts) {
    console.log('[Statistics] Cannot init charts:', { hasData: !!statsData.value, hasEcharts: !!echarts })
    return
  }
  
  // 检查是否有有效数据
  if (!hasData.value) {
    console.log('[Statistics] No valid data to display')
    return
  }

  const colors = getChartColors()
  const isDark = isDarkTheme()
  
  console.log('[Statistics] Initializing charts with theme:', isDark ? 'dark' : 'light')

  const commonOption = {
    textStyle: { color: colors.textColor },
    title: { textStyle: { color: colors.textColor } },
    legend: { textStyle: { color: colors.textColor } }
  }

  // 职位沟通排行（横向柱状图）
  if (jobChartRef.value) {
    jobChart?.dispose()
    jobChart = echarts.init(jobChartRef.value, isDark ? 'dark' : undefined)
    jobChart.setOption({
      ...commonOption,
      backgroundColor: colors.backgroundColor,
      tooltip: { 
        trigger: 'axis', 
        axisPointer: { type: 'shadow' },
        backgroundColor: isDark ? 'rgba(50,50,50,0.9)' : 'rgba(255,255,255,0.9)',
        borderColor: isDark ? '#555' : '#ccc',
        textStyle: { color: colors.textColor }
      },
      grid: { left: '3%', right: '4%', bottom: '3%', top: '3%', containLabel: true },
      xAxis: { 
        type: 'value', 
        minInterval: 1,
        axisLine: { lineStyle: { color: colors.axisColor } },
        axisLabel: { color: colors.textColor },
        splitLine: { lineStyle: { color: colors.splitLineColor } }
      },
      yAxis: { 
        type: 'category', 
        data: statsData.value.jobRank.map((item: any) => item.jobName).reverse(),
        axisLabel: { 
          width: 120, 
          overflow: 'truncate',
          color: colors.textColor
        },
        axisLine: { lineStyle: { color: colors.axisColor } }
      },
      series: [{
        type: 'bar',
        data: statsData.value.jobRank.map((item: any) => item.count).reverse(),
        itemStyle: { 
          color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [
            { offset: 0, color: '#5470c6' },
            { offset: 1, color: '#91cc75' }
          ]),
          borderRadius: [0, 4, 4, 0] 
        }
      }]
    })
  }

  // 公司沟通排行（横向柱状图）
  if (companyChartRef.value) {
    companyChart?.dispose()
    companyChart = echarts.init(companyChartRef.value, isDark ? 'dark' : undefined)
    companyChart.setOption({
      ...commonOption,
      backgroundColor: colors.backgroundColor,
      tooltip: { 
        trigger: 'axis', 
        axisPointer: { type: 'shadow' },
        backgroundColor: isDark ? 'rgba(50,50,50,0.9)' : 'rgba(255,255,255,0.9)',
        borderColor: isDark ? '#555' : '#ccc',
        textStyle: { color: colors.textColor }
      },
      grid: { left: '3%', right: '4%', bottom: '3%', top: '3%', containLabel: true },
      xAxis: { 
        type: 'value', 
        minInterval: 1,
        axisLine: { lineStyle: { color: colors.axisColor } },
        axisLabel: { color: colors.textColor },
        splitLine: { lineStyle: { color: colors.splitLineColor } }
      },
      yAxis: { 
        type: 'category', 
        data: statsData.value.companyRank.map((item: any) => item.companyName).reverse(),
        axisLabel: { 
          width: 120, 
          overflow: 'truncate',
          color: colors.textColor
        },
        axisLine: { lineStyle: { color: colors.axisColor } }
      },
      series: [{
        type: 'bar',
        data: statsData.value.companyRank.map((item: any) => item.count).reverse(),
        itemStyle: { 
          color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [
            { offset: 0, color: '#91cc75' },
            { offset: 1, color: '#fac858' }
          ]),
          borderRadius: [0, 4, 4, 0] 
        }
      }]
    })
  }

  // 不合适原因（饼图）
  if (reasonChartRef.value) {
    reasonChart?.dispose()
    reasonChart = echarts.init(reasonChartRef.value, isDark ? 'dark' : undefined)
    reasonChart.setOption({
      ...commonOption,
      backgroundColor: colors.backgroundColor,
      tooltip: { 
        trigger: 'item', 
        formatter: '{b}: {c} ({d}%)',
        backgroundColor: isDark ? 'rgba(50,50,50,0.9)' : 'rgba(255,255,255,0.9)',
        borderColor: isDark ? '#555' : '#ccc',
        textStyle: { color: colors.textColor }
      },
      legend: { 
        orient: 'vertical', 
        right: '5%', 
        top: 'center', 
        type: 'scroll',
        textStyle: { color: colors.textColor }
      },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 6, borderColor: isDark ? '#333' : '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
        data: statsData.value.notSuitReasons
      }]
    })
  }

  // 薪资范围（柱状图）
  if (salaryChartRef.value) {
    salaryChart?.dispose()
    salaryChart = echarts.init(salaryChartRef.value, isDark ? 'dark' : undefined)
    salaryChart.setOption({
      ...commonOption,
      backgroundColor: colors.backgroundColor,
      tooltip: { 
        trigger: 'axis', 
        axisPointer: { type: 'shadow' },
        backgroundColor: isDark ? 'rgba(50,50,50,0.9)' : 'rgba(255,255,255,0.9)',
        borderColor: isDark ? '#555' : '#ccc',
        textStyle: { color: colors.textColor }
      },
      grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
      xAxis: { 
        type: 'category', 
        data: statsData.value.salaryRanges.map((item: any) => item.range),
        axisLabel: { 
          rotate: 30, 
          fontSize: 10,
          color: colors.textColor
        },
        axisLine: { lineStyle: { color: colors.axisColor } }
      },
      yAxis: { 
        type: 'value', 
        minInterval: 1,
        axisLine: { lineStyle: { color: colors.axisColor } },
        axisLabel: { color: colors.textColor },
        splitLine: { lineStyle: { color: colors.splitLineColor } }
      },
      series: [{
        type: 'bar',
        data: statsData.value.salaryRanges.map((item: any) => item.count),
        itemStyle: { 
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#83bff6' },
            { offset: 0.5, color: '#188df0' },
            { offset: 1, color: '#188df0' }
          ]),
          borderRadius: [4, 4, 0, 0]
        }
      }]
    })
  }

  // 行业分布（柱状图）
  if (industryChartRef.value) {
    industryChart?.dispose()
    industryChart = echarts.init(industryChartRef.value, isDark ? 'dark' : undefined)
    industryChart.setOption({
      ...commonOption,
      backgroundColor: colors.backgroundColor,
      tooltip: { 
        trigger: 'axis', 
        axisPointer: { type: 'shadow' },
        backgroundColor: isDark ? 'rgba(50,50,50,0.9)' : 'rgba(255,255,255,0.9)',
        borderColor: isDark ? '#555' : '#ccc',
        textStyle: { color: colors.textColor }
      },
      grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
      xAxis: { 
        type: 'category', 
        data: statsData.value.industries.map((item: any) => item.name),
        axisLabel: { 
          rotate: 30, 
          fontSize: 10,
          color: colors.textColor
        },
        axisLine: { lineStyle: { color: colors.axisColor } }
      },
      yAxis: { 
        type: 'value', 
        minInterval: 1,
        axisLine: { lineStyle: { color: colors.axisColor } },
        axisLabel: { color: colors.textColor },
        splitLine: { lineStyle: { color: colors.splitLineColor } }
      },
      series: [{
        type: 'bar',
        data: statsData.value.industries.map((item: any) => item.count),
        itemStyle: { 
          color: '#fac858',
          borderRadius: [4, 4, 0, 0] 
        }
      }]
    })
  }

  // 公司规模（饼图）
  if (scaleChartRef.value) {
    scaleChart?.dispose()
    scaleChart = echarts.init(scaleChartRef.value, isDark ? 'dark' : undefined)
    scaleChart.setOption({
      ...commonOption,
      backgroundColor: colors.backgroundColor,
      tooltip: { 
        trigger: 'item', 
        formatter: '{b}: {c} ({d}%)',
        backgroundColor: isDark ? 'rgba(50,50,50,0.9)' : 'rgba(255,255,255,0.9)',
        borderColor: isDark ? '#555' : '#ccc',
        textStyle: { color: colors.textColor }
      },
      legend: { 
        orient: 'vertical', 
        right: '5%', 
        top: 'center',
        textStyle: { color: colors.textColor }
      },
      series: [{
        type: 'pie',
        radius: '65%',
        center: ['35%', '50%'],
        data: statsData.value.scales,
        itemStyle: { borderColor: isDark ? '#333' : '#fff', borderWidth: 2 },
        emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' } }
      }]
    })
  }

  // 融资情况（饼图）
  if (stageChartRef.value) {
    stageChart?.dispose()
    stageChart = echarts.init(stageChartRef.value, isDark ? 'dark' : undefined)
    stageChart.setOption({
      ...commonOption,
      backgroundColor: colors.backgroundColor,
      tooltip: { 
        trigger: 'item', 
        formatter: '{b}: {c} ({d}%)',
        backgroundColor: isDark ? 'rgba(50,50,50,0.9)' : 'rgba(255,255,255,0.9)',
        borderColor: isDark ? '#555' : '#ccc',
        textStyle: { color: colors.textColor }
      },
      legend: { 
        orient: 'vertical', 
        right: '5%', 
        top: 'center', 
        type: 'scroll',
        textStyle: { color: colors.textColor }
      },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['35%', '50%'],
        itemStyle: { borderRadius: 6, borderColor: isDark ? '#333' : '#fff', borderWidth: 2 },
        data: statsData.value.stages
      }]
    })
  }

  // 热门职位（横向柱状图）
  if (jobNameChartRef.value) {
    jobNameChart?.dispose()
    jobNameChart = echarts.init(jobNameChartRef.value, isDark ? 'dark' : undefined)
    jobNameChart.setOption({
      ...commonOption,
      backgroundColor: colors.backgroundColor,
      tooltip: { 
        trigger: 'axis', 
        axisPointer: { type: 'shadow' },
        backgroundColor: isDark ? 'rgba(50,50,50,0.9)' : 'rgba(255,255,255,0.9)',
        borderColor: isDark ? '#555' : '#ccc',
        textStyle: { color: colors.textColor }
      },
      grid: { left: '3%', right: '4%', bottom: '3%', top: '3%', containLabel: true },
      xAxis: { 
        type: 'value', 
        minInterval: 1,
        axisLine: { lineStyle: { color: colors.axisColor } },
        axisLabel: { color: colors.textColor },
        splitLine: { lineStyle: { color: colors.splitLineColor } }
      },
      yAxis: { 
        type: 'category', 
        data: statsData.value.jobNames.map((item: any) => item.name).reverse(),
        axisLabel: { 
          width: 140, 
          overflow: 'truncate',
          color: colors.textColor
        },
        axisLine: { lineStyle: { color: colors.axisColor } }
      },
      series: [{
        type: 'bar',
        data: statsData.value.jobNames.map((item: any) => item.count).reverse(),
        itemStyle: { 
          color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [
            { offset: 0, color: '#73c0de' },
            { offset: 1, color: '#91cc75' }
          ]),
          borderRadius: [0, 4, 4, 0]
        }
      }]
    })
  }
}

// 处理时间范围变化
function handleTimeRangeChange() {
  fetchStatistics()
}

// 监听主题变化
const observer = new MutationObserver(() => {
  if (statsData.value) {
    initCharts()
  }
})

// 窗口大小变化时重新调整图表
function handleResize() {
  jobChart?.resize()
  companyChart?.resize()
  reasonChart?.resize()
  salaryChart?.resize()
  industryChart?.resize()
  scaleChart?.resize()
  stageChart?.resize()
  jobNameChart?.resize()
}

onMounted(() => {
  fetchStatistics()
  window.addEventListener('resize', handleResize)
  
  // 监听主题变化
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  observer.disconnect()
  jobChart?.dispose()
  companyChart?.dispose()
  reasonChart?.dispose()
  salaryChart?.dispose()
  industryChart?.dispose()
  scaleChart?.dispose()
  stageChart?.dispose()
  jobNameChart?.dispose()
})
</script>

<style lang="scss" scoped>
.statistics-dashboard {
  padding: 20px;
  min-height: 100%;
  background: var(--bg-primary);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  
  .page-title {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--text-primary);
  }
}

.loading-container {
  background: var(--bg-secondary);
  padding: 20px;
  border-radius: 8px;
}

.overview-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.stat-card {
  background: var(--bg-secondary);
  border-color: var(--border-primary);
  min-width: 0; // 防止内容溢出
  
  :deep(.el-card__body) {
    display: flex;
    align-items: center;
    padding: 16px;
  }
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  margin-right: 12px;
}

.stat-icon-blue {
  background: var(--primary-color-light, #e6f7ff);
  color: #1890ff;
}

.stat-icon-orange {
  background: var(--warning-color-light, #fff7e6);
  color: #fa8c16;
}

.stat-icon-green {
  background: var(--success-color-light, #f6ffed);
  color: #52c41a;
}

.stat-icon-red {
  background: var(--danger-color-light, #fff1f0);
  color: #f5222d;
}

.stat-content {
  flex: 1;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.2;
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
  display: flex;
  align-items: center;
}

.stat-sub {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 2px;
  opacity: 0.8;
}

.charts-grid {
  display: grid;
  grid-template-columns: 1fr; // 单列布局，每个图表占满宽度
  gap: 16px;
}

.chart-card {
  background: var(--bg-secondary);
  border-color: var(--border-primary);
  width: 100%;
  
  :deep(.el-card__header) {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-primary);
  }
  
  :deep(.el-card__body) {
    padding: 16px;
  }
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chart-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.chart-container {
  height: 350px; // 增加高度
  width: 100%;
}

@media (max-width: 1200px) {
  .overview-cards {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .charts-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .overview-cards {
    grid-template-columns: 1fr;
  }
}
</style>
