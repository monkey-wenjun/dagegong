export interface ResumeContent {
  // Markdown 格式的完整简历内容（主要字段）
  markdownContent?: string
  
  // 以下字段已弃用，保留用于向后兼容
  name?: string
  workYearDesc?: string
  expectJob?: string
  userDescription?: string
  expectSalary?: [string, string]
  geekWorkExpList?: Array<{
    company: string
    positionName: string
    startYearMon: string | null
    endYearMon: string | null
    performance: string
    workDescription: string
  }>
  geekProjExpList?: Array<{
    name: string
    startYearMon: string
    endYearMon: string
    roleName: string
    projectDescription: string
    performance: string
  }>
}

export function formatResumeJsonToMarkdown(resume) {
  // 如果已有 markdownContent，直接使用
  if (resume.content.markdownContent?.trim()) {
    return resume.content.markdownContent
  }

  // 兼容旧格式：从表单字段生成 Markdown
  const basicInfoText = [
    ['# 姓名', resume.content.name],
    ['# 工作年限', resume.content.workYearDesc],
    ['# 期望职位', resume.content.expectJob],
    ['# 个人优势', resume.content.userDescription]
  ]
    .filter((it) => {
      return Boolean(it[1]?.trim())
    })
    .map((it) => it.join('\n'))
    .join('\n\n')

  let formattedWorkExpText = (resume.content.geekWorkExpList || [])
    .filter((it) => Boolean(it.company?.trim()))
    .map((it) => {
      const info = [
        [`职务`, it.positionName],
        [`任职时间`],
        [`工作描述`, it.workDescription],
        [`工作业绩`, it.performance]
      ].filter((it) => {
        return Boolean(it[1]?.trim())
      })
      return [[`## ${it.company}`], ...info].map((it) => it.join('\n')).join('\n\n')
    })
    .join('\n')
  if (formattedWorkExpText?.trim()) {
    formattedWorkExpText = '# 工作经历\n' + formattedWorkExpText
  }

  let formattedProjWorkExpText = (resume.content.geekProjExpList || [])
    .filter((it) => Boolean(it.name?.trim()))
    .map((it) => {
      const info = [
        [`## ${it.name}`],
        [`项目角色`, it.roleName],
        [`项目时间`],
        [`工作描述`, it.projectDescription],
        [`工作业绩`, it.performance]
      ].filter((it) => {
        return Boolean(it[1]?.trim())
      })

      return [[`## ${it.name}`], ...info].map((it) => it.join('\n')).join('\n\n')
    })
    .join('\n')
  if (formattedProjWorkExpText?.trim()) {
    formattedProjWorkExpText = '# 项目经历\n' + formattedProjWorkExpText
  }

  const result = `${basicInfoText}\n\n${formattedWorkExpText}\n\n${formattedProjWorkExpText}`

  return result
}

export function checkIsResumeContentValid(resumeItem: { content: ResumeContent }) {
  // 新格式：只要有 markdownContent 或旧的数组格式任一即可
  const hasMarkdown = !!resumeItem?.content?.markdownContent?.trim()
  const hasOldFormat = !!(
    resumeItem?.content?.geekProjExpList?.[0]?.name?.trim() &&
    resumeItem?.content?.geekWorkExpList?.[0]?.company?.trim()
  )
  return hasMarkdown || hasOldFormat
}

export function resumeContentEnoughDetect(resumeItem: { content: ResumeContent }) {
  if (!resumeItem?.content) return false
  // 新格式：检查 markdownContent 长度
  if (resumeItem.content.markdownContent?.trim()) {
    return resumeItem.content.markdownContent.length > 200
  }
  // 旧格式：检查生成的 Markdown 长度
  return formatResumeJsonToMarkdown(resumeItem)?.length > 800
}
