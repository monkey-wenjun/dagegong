import { Page } from 'puppeteer'
import { sleepWithRandomDelay, sleep } from '@geekgeekrun/utils/sleep.mjs'
import { completes } from '@geekgeekrun/utils/gpt-request.mjs'
import { recordGptCompletionRequest, RequestSceneEnum } from '../../features/llm-request-log'
import {
  readConfigFile,
  readStorageFile,
  writeStorageFile
} from '@geekgeekrun/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { formatResumeJsonToMarkdown } from '../../../common/utils/resume'
import { SINGLE_ITEM_DEFAULT_SERVE_WEIGHT } from '../../../common/constant'
import { LlmModelUsageRecord } from '@geekgeekrun/sqlite-plugin/dist/entity/LlmModelUsageRecord'
import gtag from '../../utils/gtag'

export const sendLookForwardReplyEmotion = async (page: Page) => {
  const emotionEntryButtonProxy = await page.$('.chat-conversation .message-controls .btn-emotion')
  await emotionEntryButtonProxy!.click()
  await sleepWithRandomDelay(1000)
  const duckEmotionTabEntryProxy = await page.$(
    '.chat-conversation .message-controls .emotion .emotion-tab .emotion-sort:nth-child(3)'
  )
  await duckEmotionTabEntryProxy!.click()
  await sleepWithRandomDelay(1500)
  const lookForwardReplyEmojiProxy = await page.$(
    `.chat-conversation .message-controls .emotion .emotion-box img[title=盼回复]`
  )
  await lookForwardReplyEmojiProxy!.click()
}

const pickLlmConfigFromList = (llmConfigList, blockModelSet) => {
  if (llmConfigList.length === 1) {
    llmConfigList[0].enabled = true
    llmConfigList[0].serveWeight = SINGLE_ITEM_DEFAULT_SERVE_WEIGHT
  }
  llmConfigList = llmConfigList.filter((it) => it.enabled && !blockModelSet.has(it.id))
  if (!llmConfigList.length) {
    return null
  }
  llmConfigList.forEach((conf) => {
    if (!Number(conf.serveWeight) || conf.serveWeight < 1) {
      conf.serveWeight = 1
    }
    if (conf.serveWeight > 100) {
      conf.serveWeight = 100
    }
  })
  const pool: number[] = []
  for (let i = 0; i < llmConfigList.length; i++) {
    for (let j = 0; j < Math.floor(llmConfigList[i].serveWeight); j++) {
      pool.push(llmConfigList[i].id)
    }
  }
  if (!pool.length) {
    return null
  }
  const index = Math.floor(pool.length * Math.random())
  return llmConfigList.find((it) => it.id === pool[index]) ?? null
}

// let _index = 0

const RESUME_PLACEHOLDER = `__REPLACE_REAL_RESUME_HERE__`
export const defaultPromptMap = {
  rechat: {
    fileName: 'auto-reminder-resume-system-message-template.md',
    content: `**核心指令：**
你是一个智能求职助手，需要根据用户简历生成30字左右的提醒消息，满足以下要求：
1. 每次生成需满足：
   - √ 包含1个核心技能 + 1个成果量化
   - √ 使用不同句式模板（至少准备5种）
   - √ 谦虚一些，头衔、工作年限等在历史记录信息中出现一次就好
   - ✗ 严禁与最近发送的几条相似或雷同
   - ✗ 严禁出现简历之外的词语
   - ✗ 严禁包含最近8条已经发过的内容（包括但不限于职位名称）

**简历分析层：**
请从以下简历内容中提取关键要素：\n\`\`\`markdown\n${RESUME_PLACEHOLDER}\n\`\`\`\n

---
要求提取：
1. 硬技能：编程语言/技术栈/工具证书等（至少提取5项）
2. 项目经历与成果：业绩、带量化数据的结果（至少3条）
3. 软技能：沟通/管理等（至少2项）
4. 特殊成就：奖项/专利等（可选）

**消息生成层：**
根据上述要素随机组合生成消息

**质量控制层：**
每次生成前执行：
1. 检查历史记录
2. 确保技能/成果组合未重复
3. 确保所生成的新消息不包含最近8条已经发过的内容（包括但不限于职位名称）
4. 字数严格控制在10-40字
5. 避免感叹号等激进符号
6. 减少头衔“资深”、“高级”出现的频率，严禁出现“专家”、“老兵”；减少工作年限“x年”出现的频率

**输出格式：**
请确保仅回复一句话，以JSON响应，不要包含其他解释或内容；数据结构参考：\`{"response": "这里是将会发送给招聘者的内容"}\``
  },
  open: {
    fileName: 'auto-reminder-open-message-template.md',
    content:
      '请根据我的简历，帮我写一句谦逊有礼貌的开场白。开头包含“您好”等类似敬语、结尾包含“期待回复”等类似话术。不必包含简历中的具体内容，但需要表达出应聘意向。请确保仅响应一句话，以JSON响应；数据结构参考：`{"response": "这里是将会发送给招聘者的内容"}`'
  }
}

export const getValidTemplate = async ({ type }) => {
  let template = await readStorageFile(defaultPromptMap[type].fileName, { isJson: false })
  if (!template) {
    await writeDefaultAutoRemindPrompt({ type })
    template = defaultPromptMap[type].content
  }
  if (type === 'rechat' && !template.includes(RESUME_PLACEHOLDER)) {
    const e = new Error(`简历内容占位符字符串不存在。占位字符串是 ${RESUME_PLACEHOLDER}`)
    e.name = `RESUME_PLACEHOLDER_NOT_EXIST`
    throw e
  }
  return template
}

export const writeDefaultAutoRemindPrompt = async ({ type }) => {
  switch (type) {
    case 'rechat':
      await writeStorageFile(defaultPromptMap[type].fileName, defaultPromptMap[type].content, {
        isJson: false
      })
      break
    case 'open':
      await writeStorageFile(defaultPromptMap[type].fileName, defaultPromptMap[type].content, {
        isJson: false
      })
      break
  }
}

export const requestNewMessageContent = async (
  chatRecords,
  {
    requestScene,
    llmConfigIdForPick
  }: {
    requestScene?: RequestSceneEnum
    llmConfigIdForPick?: string[]
  } = {}
) => {
  const systemMessageTemplate = await getValidTemplate({ type: 'rechat' })
  const resumeObject = (await readConfigFile('resumes.json'))?.[0]
  const resumeContent = formatResumeJsonToMarkdown(resumeObject)
  const chatList = [
    {
      role: 'system',
      content: systemMessageTemplate.replace(RESUME_PLACEHOLDER, resumeContent)
    }
  ]
  const openMessageTemplate = await getValidTemplate({ type: 'open' })
  chatList.push({
    role: 'user',
    content: openMessageTemplate
  })
  // chatRecords = chatRecords.slice(chatRecords.length - _index)
  for (const record of chatRecords) {
    const assistantJsonContent = JSON.stringify({
      response: record.text
    })
    chatList.push({
      role: 'assistant',
      content: `\`\`\`json\n${assistantJsonContent}\n\`\`\``
    })
    chatList.push({
      role: 'user',
      content:
        '围绕我简历中关于自我介绍、技术栈、工作经历、项目描述、项目业绩等内容，写一句自我介绍。开头不必包含“您好”、结尾不必包含“期待回复”；务必确保本次所回复的内容不能与之前所回复的内容雷同或相似。请确保仅回复一句话，以JSON响应，不要包含其他解释或内容；数据结构参考：`{"response": "这里是将会发送给招聘者的内容"}`'
    })
  }
  console.log(chatList)
  let res, llmConfig
  const llmRequestRecord: Omit<LlmModelUsageRecord, 'id' | 'providerApiSecretMd5'> & {
    providerApiSecret: string
  } = {}
  const blockModelSet = new Set()
  while (!res) {
    let llmConfigList = await readConfigFile('llm.json')
    if (llmConfigIdForPick?.length) {
      llmConfigList = llmConfigList.filter((it) => {
        return llmConfigIdForPick.includes(it.id)
      })
    }
    llmConfig = pickLlmConfigFromList(llmConfigList, blockModelSet)
    if (!llmConfig) {
      throw new Error(`CANNOT_FIND_A_USABLE_MODEL`)
    }
    console.log(llmConfig.providerCompleteApiUrl)
    Object.assign(llmRequestRecord, {
      providerCompleteApiUrl: llmConfig.providerCompleteApiUrl,
      model: llmConfig.model,
      providerApiSecret: llmConfig.providerApiSecret,
      requestStartTime: new Date(),
      hasError: false,
      errorMessage: '',
      requestScene
    })
    try {
      const completion = await completes(
        {
          baseURL: llmConfig.providerCompleteApiUrl,
          apiKey: llmConfig.providerApiSecret,
          model: llmConfig.model
        },
        chatList
      )
      res = completion?.choices?.[0] ?? null
      Object.assign(llmRequestRecord, {
        completionTokens: completion.usage?.completion_tokens ?? null,
        promptCacheHitTokens: completion.usage?.prompt_cache_hit_tokens ?? null,
        promptCacheMissTokens: completion.usage?.prompt_cache_miss_tokens ?? null,
        promptTokens: completion.usage?.prompt_tokens ?? null,
        totalTokens: completion.usage?.total_tokens ?? null
      } as LlmModelUsageRecord)
    } catch (err) {
      console.log('request failed', err)
      blockModelSet.add(llmConfig.id)
      Object.assign(llmRequestRecord, {
        hasError: true,
        errorMessage: err?.message ?? ''
      })
    } finally {
      llmRequestRecord.requestEndTime = new Date()
      try {
        await recordGptCompletionRequest(llmRequestRecord)
      } catch (err) {
        console.log('CANNOT_SAVE_LLM_COMPLETION_LOG', err)
      }
    }
  }
  console.log(res)
  // _index++
  let textToSend
  try {
    const rawMarkdownText = res?.message?.content
    try {
      textToSend = JSON.parse(
        rawMarkdownText.replace(/^```json/m, '').replace(/```$/m, '')
      )?.response
    } catch (err) {
      gtag('encounter_error_when_parse_llm_text', {
        err,
        model: llmConfig?.model,
        providerCompleteApiUrl: llmConfig?.providerCompleteApiUrl
      })
      throw err
    }
    textToSend = textToSend?.replace(/。$/, '')
    if (!textToSend) {
      gtag('llm_respond_text_is_empty', {
        model: llmConfig?.model,
        providerCompleteApiUrl: llmConfig?.providerCompleteApiUrl
      })
      throw new Error(`empty content. ${err?.message} ${res?.message?.content}`)
    }
  } catch (err) {
    throw new Error(`fail to parse response. ${err?.message} ${res?.message?.content}`)
  }
  return {
    responseText: textToSend,
    usedLlmConfig: llmConfig,
    recordInfo: llmRequestRecord
  }
}

export async function getGptContent(chatRecords) {
  const textToSend = (
    await requestNewMessageContent(chatRecords, {
      requestScene: RequestSceneEnum.readNoReplyAutoReminder
    })
  ).responseText
  return textToSend
}

export async function sendMessage(page: Page, textToSend: string) {
  const chatInputSelector = `.chat-conversation .message-controls .chat-input`
  const chatInputHandle = (await page.$(chatInputSelector))!
  await chatInputHandle.click()
  await sleep(500)
  await chatInputHandle.click()
  await chatInputHandle.type(textToSend, {
    delay: 50
  })
  await sleep(1000)
  const sendButtonSelector = `.chat-conversation .message-controls .chat-op .btn-send:not(.disabled)`
  await page.click(sendButtonSelector)
}

// PDF 简历解析 Prompt
const RESUME_PARSE_PROMPT = `你是一位专业的简历解析专家。请从以下 PDF 简历文本中提取关键信息，并整理成 Markdown 格式返回。

**PDF 简历文本：**
\`\`\`
{{PDF_TEXT}}
\`\`\`

**请提取以下信息并返回 JSON 格式：**

1. name: 姓名
2. workYearDesc: 工作年限描述（如 "3年经验"、"5年以上经验"）
3. expectJob: 期望职位
4. expectSalary: 期望薪资范围（数组格式 [最低, 最高]，单位 k，如 ["20", "35"]）
5. userDescription: 个人优势/自我评价（一句话简介，50字以内）
6. markdownContent: **完整的简历内容，使用 Markdown 格式**

**markdownContent 格式要求：**
- 使用标准的 Markdown 语法
- 包含以下章节（如有）：基本信息、个人优势、工作经历、项目经历、教育背景、技能特长
- 工作经历格式示例：
  ### 公司名称
  **职位**：高级开发工程师  
  **时间**：2020-01 至 2024-03
  
  - 负责 XXX 系统的架构设计与开发
  - 带领团队完成项目交付
- 项目经历格式示例：
  ### 项目名称
  **角色**：技术负责人  
  **时间**：2022-06 至 2023-12
  
  - 项目描述：...
  - 技术栈：...
  - 项目成果：...

**输出格式：**
只返回 JSON 数据，不要包含任何解释文字。

格式示例：
{"name":"张三","workYearDesc":"5年经验","expectJob":"Java开发工程师","expectSalary":["20","35"],"userDescription":"5年Java开发经验，精通Spring生态","markdownContent":"# 个人简历\\n\\n## 工作经历\\n\\n### XX公司\\n**职位**：Java开发工程师\\n**时间**：2020-01 至 2024-03\\n\\n- 负责...\\n- 使用...\\n"}

**注意事项：**
- 确保 JSON 格式正确，markdownContent 中的换行使用 \\n 转义
- 如果某个字段在简历中没有明确信息，使用空字符串
- 工作经历和项目经历按时间倒序排列（最近的在前面）
- 完整保留简历中的所有重要信息到 markdownContent 中`

/**
 * 使用 LLM 解析 PDF 简历文本
 * @param pdfText PDF 中提取的文本内容
 * @returns 解析后的简历结构化数据
 */
export const parseResumeFromPdf = async (pdfText: string) => {
  if (!pdfText?.trim()) {
    throw new Error('PDF text is empty')
  }

  const systemMessage = RESUME_PARSE_PROMPT.replace('{{PDF_TEXT}}', pdfText)
  const chatList = [
    {
      role: 'system',
      content: systemMessage
    },
    {
      role: 'user',
      content: '请解析上述 PDF 简历，返回 JSON 格式的结构化数据。'
    }
  ]

  const llmConfigList = await readConfigFile('llm.json')
  if (!Array.isArray(llmConfigList) || !llmConfigList.length) {
    throw new Error('No LLM configuration found')
  }

  // 使用第一个启用的模型
  const llmConfig = llmConfigList.find((it) => it.enabled) || llmConfigList[0]

  const llmRequestRecord: Omit<LlmModelUsageRecord, 'id' | 'providerApiSecretMd5'> & {
    providerApiSecret: string
  } = {
    providerCompleteApiUrl: llmConfig.providerCompleteApiUrl,
    model: llmConfig.model,
    providerApiSecret: llmConfig.providerApiSecret,
    requestStartTime: new Date(),
    hasError: false,
    errorMessage: '',
    requestScene: RequestSceneEnum.resumeParse
  }

  let res
  try {
    const completion = await completes(
      {
        baseURL: llmConfig.providerCompleteApiUrl,
        apiKey: llmConfig.providerApiSecret,
        model: llmConfig.model
      },
      chatList
    )
    res = completion?.choices?.[0] ?? null
    Object.assign(llmRequestRecord, {
      completionTokens: completion.usage?.completion_tokens ?? null,
      promptCacheHitTokens: completion.usage?.prompt_cache_hit_tokens ?? null,
      promptCacheMissTokens: completion.usage?.prompt_cache_miss_tokens ?? null,
      promptTokens: completion.usage?.prompt_tokens ?? null,
      totalTokens: completion.usage?.total_tokens ?? null
    })
  } catch (err) {
    console.log('LLM request failed', err)
    Object.assign(llmRequestRecord, {
      hasError: true,
      errorMessage: err?.message ?? ''
    })
    throw new Error('LLM request failed: ' + err?.message)
  } finally {
    llmRequestRecord.requestEndTime = new Date()
    try {
      await recordGptCompletionRequest(llmRequestRecord)
    } catch (err) {
      console.log('CANNOT_SAVE_LLM_COMPLETION_LOG', err)
    }
  }

  // 解析 LLM 返回的 JSON
  let parsedResume
  try {
    let rawMarkdownText = res?.message?.content
    console.log('LLM raw response:', rawMarkdownText)
    
    // 尝试提取 JSON 代码块 - 处理多种格式
    // 格式1: ```json\n{...}\n```
    // 格式2: ```json {...}```
    // 格式3: ```\n{...}\n```
    let jsonText = rawMarkdownText
    
    // 先尝试匹配带 json 标记的代码块
    const jsonCodeBlockMatch = rawMarkdownText.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonCodeBlockMatch) {
      jsonText = jsonCodeBlockMatch[1]
    } else {
      // 尝试匹配不带 json 标记的代码块
      const codeBlockMatch = rawMarkdownText.match(/```\s*([\s\S]*?)\s*```/)
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1]
      }
    }
    
    // 清理可能的换行和空格
    jsonText = jsonText.trim()
    
    // 如果内容不是以 { 或 [ 开头，尝试找 JSON 部分
    if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
      const jsonObjMatch = jsonText.match(/(\{[\s\S]*\})/)
      const jsonArrMatch = jsonText.match(/(\[[\s\S]*\])/)
      if (jsonObjMatch) {
        jsonText = jsonObjMatch[1]
      } else if (jsonArrMatch) {
        jsonText = jsonArrMatch[1]
      }
    }
    
    // 修复常见的 JSON 格式问题
    jsonText = fixJsonText(jsonText)
    
    console.log('Parsed JSON text:', jsonText)
    
    // 尝试解析修复后的 JSON
    try {
      parsedResume = JSON.parse(jsonText)
    } catch (parseErr) {
      // 如果还是失败，检查是否是截断的 JSON 并尝试修复
      console.log('First parse failed, error:', parseErr.message)
      if (isJsonTruncated(jsonText)) {
        console.log('JSON appears truncated, trying to fix...')
        const fixedTruncated = fixTruncatedJson(jsonText)
        console.log('Fixed truncated JSON:', fixedTruncated)
        parsedResume = JSON.parse(fixedTruncated)
      } else {
        throw parseErr
      }
    }
  } catch (err) {
    console.error('Failed to parse LLM response:', err)
    console.error('Raw response:', res?.message?.content)
    throw new Error('Failed to parse LLM resume data: ' + err?.message)
  }

  // 验证并填充默认值
  const defaultResume = {
    name: '',
    workYearDesc: '',
    expectJob: '',
    expectSalary: ['', ''],
    userDescription: '',
    markdownContent: '',
    geekWorkExpList: [],
    geekProjExpList: []
  }

  const result = { ...defaultResume, ...parsedResume }

  // 确保数组字段正确
  if (!Array.isArray(result.geekWorkExpList)) {
    result.geekWorkExpList = []
  }
  if (!Array.isArray(result.geekProjExpList)) {
    result.geekProjExpList = []
  }
  if (!Array.isArray(result.expectSalary)) {
    result.expectSalary = ['', '']
  }

  return result
}

/**
 * 修复 LLM 返回的可能损坏的 JSON 字符串
 * 处理常见问题：未转义的字符、未闭合的字符串、尾部逗号等
 */
function fixJsonText(jsonText: string): string {
  // 1. 首先处理换行符和回车符
  let fixed = jsonText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  
  // 2. 移除零宽字符和其他控制字符（保留 \n \t \r 的转义形式）
  fixed = fixed.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u200b-\u200f\ufeff]/g, '')
  
  // 3. 修复字符串中实际的换行符（转为 \n）
  // 但首先保护已经在字符串内的 \n
  fixed = fixed.replace(/\\n/g, '\x00NEWLINE\x00')
  fixed = fixed.replace(/\\t/g, '\x00TAB\x00')
  fixed = fixed.replace(/\\"/g, '\x00QUOTE\x00')
  fixed = fixed.replace(/\\\\/g, '\x00BACKSLASH\x00')
  
  // 4. 现在将真实的换行和回车转为 \n
  fixed = fixed.replace(/\n/g, '\\n')
  fixed = fixed.replace(/\t/g, '\\t')
  
  // 5. 恢复被保护的转义序列
  fixed = fixed.replace(/\x00NEWLINE\x00/g, '\\n')
  fixed = fixed.replace(/\x00TAB\x00/g, '\\t')
  fixed = fixed.replace(/\x00QUOTE\x00/g, '\\"')
  fixed = fixed.replace(/\x00BACKSLASH\x00/g, '\\\\')
  
  // 6. 移除对象和数组末尾的多余逗号
  fixed = fixed.replace(/,\s*([}\]])/g, '$1')
  
  return fixed
}

/**
 * 检测 JSON 是否被截断
 */
function isJsonTruncated(text: string): boolean {
  const trimmed = text.trim()
  // 如果最后不是 } 或 ]，说明可能被截断了
  if (!trimmed.endsWith('}') && !trimmed.endsWith(']')) {
    return true
  }
  
  // 检查括号是否平衡
  const openBraces = (trimmed.match(/\{/g) || []).length
  const closeBraces = (trimmed.match(/\}/g) || []).length
  const openBrackets = (trimmed.match(/\[/g) || []).length
  const closeBrackets = (trimmed.match(/\]/g) || []).length
  
  return openBraces !== closeBraces || openBrackets !== closeBrackets
}

/**
 * 修复被截断的 JSON
 * 找到最后一个完整的键值对并截断，然后补全括号
 */
function fixTruncatedJson(text: string): string {
  let result = ''
  let inString = false
  let escaped = false
  let stringStartChar = ''
  let braceDepth = 0
  let bracketDepth = 0
  let lastSafePos = -1
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    
    if (!inString) {
      if (char === '"' || char === "'") {
        inString = true
        stringStartChar = char
      } else if (char === '{') {
        braceDepth++
      } else if (char === '}') {
        braceDepth--
        if (braceDepth >= 0 && bracketDepth === 0) {
          lastSafePos = i + 1
        }
      } else if (char === '[') {
        bracketDepth++
      } else if (char === ']') {
        bracketDepth--
        if (bracketDepth >= 0 && braceDepth === 0) {
          lastSafePos = i + 1
        }
      } else if (char === ',' && braceDepth === 0 && bracketDepth === 0) {
        // 顶层逗号，安全截断点
        lastSafePos = i
      }
    } else {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === stringStartChar) {
        inString = false
        // 字符串结束，如果是在顶层，记录位置
        if (braceDepth === 0 && bracketDepth === 0) {
          lastSafePos = i + 1
        }
      }
    }
  }
  
  // 如果字符串未闭合，添加闭合引号
  if (inString) {
    result = text + stringStartChar
  } else {
    result = text
  }
  
  // 如果检测到截断，截断到最后一个安全位置
  if (lastSafePos > 0 && isJsonTruncated(result)) {
    result = result.substring(0, lastSafePos)
  }
  
  // 移除末尾可能的逗号
  result = result.replace(/,\s*$/, '')
  
  // 补全未闭合的括号
  const openBraces = (result.match(/\{/g) || []).length - (result.match(/\}/g) || []).length
  const openBrackets = (result.match(/\[/g) || []).length - (result.match(/\]/g) || []).length
  
  for (let i = 0; i < openBraces; i++) {
    result += '}'
  }
  for (let i = 0; i < openBrackets; i++) {
    result += ']'
  }
  
  return result
}



