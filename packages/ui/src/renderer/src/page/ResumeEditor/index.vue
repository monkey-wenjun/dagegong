<template>
  <div class="resume-editor-page">
    <div class="main-wrapper">
      <main>
        <div class="mt1em mb1em flex flex-items-center flex-justify-between">
          <span>简历编辑器</span>
          <div flex gap-10px>
            <el-button 
              type="primary" 
              :icon="Document" 
              :loading="isParsingPdf"
              @click="handleImportPdf"
            >
              {{ isParsingPdf ? '正在解析...' : '从 PDF/Markdown 导入' }}
            </el-button>
            <el-upload
              v-model:file-list="fileList"
              action=""
              :auto-upload="false"
              :show-file-list="false"
              accept=".md,.txt,.markdown"
              @change="handleMarkdownFileChange"
            >
              <el-button :icon="Upload">导入 Markdown</el-button>
            </el-upload>
          </div>
        </div>
        <el-alert type="info" :closable="false" mb20px line-height-1.25em>
          <ul pl16px m0>
            <li>
              此简历将作为提示词的一部分提交给语言大模型，仅在匹配职位、生成已读不回提醒消息时使用
            </li>
            <li>期望薪资仅作匹配职位使用，不会用作生成已读不回提醒消息</li>
            <li>
              <b>支持格式</b>：
              <br/>• PDF：自动解析并提取关键信息
              <br/>• Markdown/文本：直接导入完整简历内容
            </li>
          </ul>
        </el-alert>
        
        <!-- 简历编辑 -->
        <el-form
          ref="formRef"
          label-position="top"
          class="resume-editor-form"
        >
          <el-form-item label="简历内容 (Markdown 格式)">
            <div class="markdown-editor-wrapper">
              <el-input
                v-model="formContent.markdownContent"
                type="textarea"
                :rows="20"
                font-size-12px
                placeholder="# 简历内容支持 Markdown 格式

## 工作经历

### 公司名称
**职位**：高级开发工程师  
**时间**：2020-01 至 2024-03

- 负责 XXX 系统的架构设计与开发
- 使用 Vue + Node.js 技术栈
- 带领 5 人团队完成项目交付

## 项目经历

### 项目名称
**角色**：技术负责人  
**时间**：2022-06 至 2023-12

- 项目描述：...
- 技术栈：...
- 项目成果：...

## 教育背景

### 学校名称
**学历**：本科  
**时间**：2016-09 至 2020-06

## 技能特长

- 编程语言：JavaScript, TypeScript, Python
- 框架：Vue, React, Node.js
- 工具：Git, Docker, Kubernetes
"
              ></el-input>
              <div class="editor-toolbar">
                <span class="char-count">{{ formContent.markdownContent?.length || 0 }} 字符</span>
                <el-button 
                  v-if="formContent.markdownContent" 
                  type="primary" 
                  link 
                  size="small"
                  @click="handlePreview"
                >
                  预览
                </el-button>
                <el-button 
                  v-if="formContent.markdownContent" 
                  type="danger" 
                  link 
                  size="small"
                  @click="handleClear"
                >
                  清空
                </el-button>
              </div>
            </div>
          </el-form-item>
        </el-form>
      </main>
    </div>
    <footer pt10px pb10px flex flex-justify-center>
      <div w-full max-w-1200px px-20px flex flex-justify-between>
        <div>
          <el-button type="text" @click="handleTemplateClick">使用模板</el-button>
        </div>
        <div>
          <el-button @click="handleCancel">取消</el-button>
          <el-button type="primary" @click="handleSubmit">确定</el-button>
        </div>
      </div>
    </footer>

    <!-- Markdown 预览对话框 -->
    <el-dialog
      v-model="previewVisible"
      title="简历预览"
      width="800px"
      :close-on-click-modal="true"
    >
      <div class="markdown-preview" v-html="renderedMarkdown"></div>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { ElForm, ElButton, ElAlert, ElMessageBox, ElMessage, ElUpload } from 'element-plus'
import { ref, onMounted, computed } from 'vue'
import { Document, Upload } from '@element-plus/icons-vue'
import { gtagRenderer as baseGtagRenderer } from '@renderer/utils/gtag'
import { type ResumeContent, resumeContentEnoughDetect } from '../../../../common/utils/resume'

const formRef = ref<InstanceType<typeof ElForm>>()

const gtagRenderer = (name, params?: object) => {
  return baseGtagRenderer(name, {
    scene: 'resume-editor',
    ...params
  })
}

const getEmptyFormContent = () => {
  return {
    markdownContent: ''
  } as ResumeContent
}

const formContent = ref<ResumeContent>(getEmptyFormContent())
const fileList = ref([])
const previewVisible = ref(false)

// 简单的 Markdown 渲染（支持基础语法）
const renderedMarkdown = computed(() => {
  let md = formContent.value.markdownContent || ''
  // 转义 HTML
  md = md.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  // 标题
  md = md.replace(/^### (.*$)/gim, '<h3>$1</h3>')
  md = md.replace(/^## (.*$)/gim, '<h2>$1</h2>')
  md = md.replace(/^# (.*$)/gim, '<h1>$1</h1>')
  // 粗体、斜体
  md = md.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
  md = md.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  md = md.replace(/\*(.*?)\*/g, '<em>$1</em>')
  // 换行
  md = md.replace(/\n/g, '<br>')
  return md
})

const handleCancel = () => {
  gtagRenderer('cancel_clicked')
  electron.ipcRenderer.send('close-resume-editor')
  gtagRenderer('cancel_done')
}

const handleSubmit = async () => {
  gtagRenderer('submit_clicked')
  if (
    !resumeContentEnoughDetect({
      content: formContent.value
    })
  ) {
    try {
      gtagRenderer('rc_not_enough_dialog_show')
      await ElMessageBox.confirm(
        `简历内容可能不够充足（Markdown 内容 < 800 字符）<br />后续大模型根据简历生成的内容将可能不符合预期<br /><br />要继续保存吗？`,
        {
          cancelButtonText: '不，我再改改',
          confirmButtonText: '是的，继续保存',
          dangerouslyUseHTMLString: true
        }
      )
    } catch {
      return
    }
  }
  electron.ipcRenderer.invoke('save-resume-content', JSON.parse(JSON.stringify(formContent.value)))
  gtagRenderer('submit_done')
}

const handlePreview = () => {
  previewVisible.value = true
  gtagRenderer('preview_clicked')
}

const handleClear = async () => {
  try {
    await ElMessageBox.confirm('确定要清空简历内容吗？', '确认清空', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    formContent.value.markdownContent = ''
    gtagRenderer('content_cleared')
  } catch {
    // 用户取消
  }
}

const handleTemplateClick = async () => {
  const template = `# 个人简历

## 基本信息

- 姓名：张三
- 工作年限：5年
- 期望职位：高级前端工程师
- 期望薪资：25k-35k

## 个人优势

5年前端开发经验，精通 Vue/React 技术栈，有丰富的大型项目架构经验。

## 工作经历

### XX科技有限公司（2020-03 至 2024-01）
**职位**：高级前端工程师

- 负责公司核心产品的前端架构设计与开发
- 使用 Vue3 + TypeScript 重构旧系统，提升页面加载速度 40%
- 带领 3 人前端团队，制定代码规范和技术方案
- 封装业务组件库，提升团队开发效率 30%

### YY互联网公司（2018-07 至 2020-02）
**职位**：前端开发工程师

- 负责电商后台管理系统开发
- 使用 React + Ant Design 构建管理界面
- 实现数据可视化大屏，支持实时数据更新

## 项目经历

### 智能客服系统（2022-06 至 2023-12）
**角色**：前端技术负责人

- 项目描述：基于大语言模型的智能客服系统
- 技术栈：Vue3 + TypeScript + WebSocket + ECharts
- 项目成果：客服效率提升 50%，用户满意度提升 20%

### 电商小程序（2021-01 至 2021-12）
**角色**：核心开发

- 项目描述：微信小程序电商平台
- 技术栈：Taro + React + Redux
- 项目成果：日活用户 10万+，订单转化率 15%

## 教育背景

### XX大学（2014-09 至 2018-06）
**学历**：本科 - 计算机科学与技术

## 技能特长

- 编程语言：JavaScript, TypeScript, HTML5, CSS3
- 前端框架：Vue2/Vue3, React, Angular
- 工程化：Webpack, Vite, Rollup
- 其他：Node.js, Git, Docker, CI/CD
`
  
  const hasContent = formContent.value.markdownContent?.trim()
  if (hasContent) {
    try {
      await ElMessageBox.confirm('使用模板将覆盖现有内容，是否继续？', '确认使用模板', {
        confirmButtonText: '继续',
        cancelButtonText: '取消',
        type: 'warning'
      })
    } catch {
      return
    }
  }
  
  formContent.value.markdownContent = template
  
  gtagRenderer('template_used')
}

// Markdown 文件导入
const handleMarkdownFileChange = async (uploadFile: any) => {
  const file = uploadFile.raw
  if (!file) return

  try {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      if (content) {
        formContent.value.markdownContent = content
        ElMessage.success('Markdown 文件导入成功')
        gtagRenderer('markdown_file_imported', { fileName: file.name, size: file.size })
      }
    }
    reader.readAsText(file)
  } catch (error) {
    ElMessage.error('文件读取失败')
    console.error('File read error:', error)
  }
}

onMounted(async () => {
  try {
    const savedFileContent = await electron.ipcRenderer.invoke('fetch-resume-content')
    if (!savedFileContent) {
      return
    }
    // 合并保存的内容
    if (savedFileContent.markdownContent !== undefined) {
      formContent.value.markdownContent = savedFileContent.markdownContent
    }
  } catch (err) {
    formContent.value = getEmptyFormContent()
  }
})

onMounted(() => {
  gtagRenderer('resume_editor_mounted')
})

// PDF 导入相关
const isParsingPdf = ref(false)

const handleImportPdf = async () => {
  gtagRenderer('import_pdf_clicked')
  
  try {
    // 选择 PDF 文件
    const result = await electron.ipcRenderer.invoke('choose-file', {
      fileChooserConfig: {
        properties: ['openFile'],
        filters: [
          { name: 'PDF 文件', extensions: ['pdf'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      }
    })
    
    if (result.canceled || !result.filePaths?.length) {
      return
    }
    
    const filePath = result.filePaths[0]
    gtagRenderer('pdf_file_selected', { fileName: filePath.split(/[/\\]/).pop() })
    
    isParsingPdf.value = true
    
    // 先解析 PDF 文本
    const parseResult = await electron.ipcRenderer.invoke('parse-pdf-resume', { filePath })
    
    if (!parseResult.success) {
      throw new Error(parseResult.error || 'PDF 解析失败')
    }
    
    // 使用 LLM 解析简历内容
    const llmParseResult = await electron.ipcRenderer.invoke('parse-pdf-resume-with-llm', {
      pdfText: parseResult.text
    })
    
    if (!llmParseResult.success) {
      throw new Error(llmParseResult.error || '简历解析失败')
    }
    
    // 填充表单
    const parsedData = llmParseResult.data
    
    // 确认是否覆盖现有内容
    const hasExistingContent = formContent.value.name || 
      formContent.value.markdownContent?.trim()
    
    if (hasExistingContent) {
      try {
        await ElMessageBox.confirm(
          '导入 PDF 将覆盖现有的简历内容，是否继续？',
          '确认导入',
          {
            confirmButtonText: '继续导入',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
      } catch {
        return
      }
    }
    
    // 填充 Markdown 内容
    if (parsedData.markdownContent) {
      formContent.value.markdownContent = parsedData.markdownContent
    } else if (parsedData.text) {
      // 如果只有解析的文本，直接使用
      formContent.value.markdownContent = parsedData.text
    }
    
    ElMessage.success({
      message: 'PDF 简历导入成功！',
      duration: 3000
    })
    gtagRenderer('pdf_import_success')
  } catch (error) {
    console.error('Import PDF error:', error)
    ElMessage.error({
      message: `导入失败: ${error.message}`,
      duration: 5000
    })
    gtagRenderer('pdf_import_error', { error: error.message })
  } finally {
    isParsingPdf.value = false
  }
}
</script>

<style lang="scss" scoped>
.resume-editor-page {
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  .main-wrapper {
    overflow: auto;
    width: 100%;
    main {
      margin: 0 auto;
      width: 100%;
      max-width: 100%;
      padding-left: 20px;
      padding-right: 20px;
    }
  }
  footer {
    background-color: #f0f0f0;
  }
}

.markdown-editor-wrapper {
  position: relative;
  width: 100%;
  
  :deep(.el-textarea) {
    width: 100%;
  }
  
  :deep(.el-textarea__inner) {
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    line-height: 1.6;
    width: 100%;
  }
}

.editor-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: #f5f7fa;
  border: 1px solid #dcdfe6;
  border-top: none;
  border-radius: 0 0 4px 4px;
  
  .char-count {
    font-size: 12px;
    color: #909399;
  }
}

.markdown-preview {
  padding: 20px;
  background-color: #fff;
  border-radius: 4px;
  line-height: 1.8;
  
  :deep(h1) {
    font-size: 24px;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 2px solid #eee;
  }
  
  :deep(h2) {
    font-size: 20px;
    margin-top: 24px;
    margin-bottom: 12px;
    color: #333;
  }
  
  :deep(h3) {
    font-size: 16px;
    margin-top: 16px;
    margin-bottom: 8px;
    color: #555;
  }
  
  :deep(strong) {
    color: #333;
  }
}
</style>

<style lang="scss">
.resume-editor-form.el-form {
  width: 100%;
  .el-form-item {
    width: 100%;
  }
  .el-form-item__content {
    width: 100%;
  }
  .el-textarea {
    width: 100%;
  }
  .el-form-item__error--inline {
    margin-left: 0;
    margin-top: 10px;
  }
}
</style>
