<template>
  <div class="group-item">
    <div class="group-title">全局设置</div>
    <div flex flex-col class="link-list">
      <RouterLink to="/main-layout/common-job-condition">
        求职全局设置选项
      </RouterLink>
      <a href="#" @click.prevent="handleClickBrowserAssistant">
        配置浏览器助手<TopRight w-1em h-1em mr10px />
      </a>
      <RouterLink to="/main-layout/llm-config">
        配置AI模型
        <div>
          <el-tooltip
            placement="right"
            :enterable="false"
            @show="gtagRenderer('tooltip_show_for_rnrr_entry')"
          >
            <template #content>
              <div class="font-size-12px">
                支持
                <span
                  class="pl6px pr6px pt4px pb2px color-white border-rd-full font-size-0.8em"
                  style="background-color: #3c4efd"
                  >DeepSeek-V3</span
                >
                <span
                  class="ml4px pl6px pr6px pt4px pb2px color-black border-rd-full font-size-0.8em"
                  style="background-color: #fff"
                  >GPT-4o mini</span
                >
                <span
                  class="ml4px pl6px pr6px pt4px pb2px color-white border-rd-full font-size-0.8em"
                  style="background-color: #462ac4"
                  >Qwen2.5</span
                >
                模型<br />支持多个"服务商-模型"组合按权重搭配使用
              </div>
            </template>
            <QuestionFilled w-1em h-1em mr10px />
          </el-tooltip>
        </div>
      </RouterLink>
      <RouterLink to="/main-layout/daily-stats-notification">
        配置通知
        <div>
          <el-tooltip
            placement="right"
            :enterable="false"
            @show="gtagRenderer('tooltip_show_for_daily_stats')"
          >
            <template #content>
              <div class="font-size-12px">
                配置飞书/钉钉机器人<br />
                定时推送当日沟通统计
              </div>
            </template>
            <QuestionFilled w-1em h-1em mr10px />
          </el-tooltip>
        </div>
      </RouterLink>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { gtagRenderer } from '@renderer/utils/gtag'
import { ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'

const handleClickBrowserAssistant = async () => {
  gtagRenderer('browser_setting_clicked')
  try {
    await electron.ipcRenderer.invoke('config-with-browser-assistant')
    ElMessage({
      type: 'success',
      message: '浏览器助手配置成功'
    })
  } catch {
    //
  }
}
</script>

<style scoped lang="scss" src="./style.scss"></style>
