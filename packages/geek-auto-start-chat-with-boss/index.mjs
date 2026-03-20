import {
  sleep,
  sleepWithRandomDelay
} from '@dagegong/utils/sleep.mjs'

import fs from 'node:fs'
import os from 'node:os'
import { get__dirname } from '@dagegong/utils/legacy-path.mjs';
import path from 'node:path';
import JSON5 from 'json5'
import { EventEmitter } from 'node:events'
import { setDomainLocalStorage } from '@dagegong/utils/puppeteer/local-storage.mjs'
import { completes } from '@dagegong/utils/gpt-request.mjs'

import { readConfigFile, writeStorageFile, ensureConfigFileExist, readStorageFile, ensureStorageFileExist } from './runtime-file-utils.mjs'
import {
  calculateTotalCombinations,
  combineFiltersWithConstraintsGenerator,
  checkAnyCombineBossRecommendFilterHasCondition,
  formatStaticCombineFilters,
} from './combineCalculator.mjs'
import { default as jobFilterConditions } from './internal-config/job-filter-conditions-20241002.json' with { type: 'json' }
import { default as rawIndustryFilterExemption } from './internal-config/job-filter-industry-filter-exemption-20241002.json' with { type: 'json' }
import { ChatStartupFrom } from './sqlite-plugin-compat.mjs'
import {
  MarkAsNotSuitReason,
  MarkAsNotSuitOp,
  StrategyScopeOptionWhenMarkJobNotMatch,
  SalaryCalculateWay,
  JobDetailRegExpMatchLogic,
  JobSource,
  CombineRecommendJobFilterType
} from './sqlite-plugin-compat.mjs'
import {
  activeDescList,
  RECOMMEND_JOB_ENTRY_SELECTOR,
  USER_SET_EXPECT_JOB_ENTRIES_SELECTOR,
  SEARCH_BOX_SELECTOR,
} from './constant.mjs'
import { parseSalary } from './sqlite-plugin-compat.mjs'
import { waitForSageTimeOrJustContinue } from './sage-time.mjs'
import cityGroupData from './cityGroup.mjs'
import { hasIntersection } from '@dagegong/utils/number.mjs';
const flattedCityList = []

// Track daily remaining chat count (null = unknown, 0 = reached limit)
let dailyRemainingChatCount = null
const DAILY_CHAT_LIMIT = 150

;(cityGroupData?.zpData?.cityGroup ?? []).forEach(it => {
  const firstChar = it.firstChar
  it.cityList.forEach(city => {
    flattedCityList.push({
      ...city,
      firstChar
    })
  })
})

const jobFilterConditionsMapByCode = {}
Object.values(jobFilterConditions).forEach(arr => {
  arr.forEach(option => {
    jobFilterConditionsMapByCode[option.code] = option
  })
})

let industryFilterCursorIndex = 0;
const industryFilterExemption = JSON.parse(JSON.stringify(rawIndustryFilterExemption))
const industryFilterConditionsMapByIndex = {}
const industryFilterConditionsMapByCode = {}
const industryFilterConditionCodeToIndexMap = {}
industryFilterExemption.forEach(item => {
  if (!Array.isArray(item.subLevelModelList)) {
    return
  }
  item.subLevelModelList.forEach(option => {
    industryFilterConditionsMapByCode[option.code] = option
    industryFilterConditionsMapByIndex[industryFilterCursorIndex] = option
    industryFilterConditionCodeToIndexMap[option.code] = industryFilterCursorIndex
    industryFilterCursorIndex++
  })
})

ensureConfigFileExist()
ensureStorageFileExist()

const isUiDev = process.env.NODE_ENV === 'development'
export const autoStartChatEventBus = new EventEmitter()

/**
 * @type { import("puppeteer") }
 */
let puppeteer
let StealthPlugin
let LaodengPlugin
let AnonymizeUaPlugin
export async function initPuppeteer () {
  console.log('[DEBUG] initPuppeteer started')
  // production
  console.log('[DEBUG] Importing puppeteer modules...')
  const importResult = await Promise.all(
    [
      import('puppeteer-extra'),
      import('puppeteer-extra-plugin-stealth'),
      import('@dagegong/puppeteer-extra-plugin-laodeng'),
      import('puppeteer-extra-plugin-anonymize-ua')
    ]
  )
  console.log('[DEBUG] Puppeteer modules imported')
  puppeteer = importResult[0].default
  StealthPlugin = importResult[1].default
  LaodengPlugin = importResult[2].default
  AnonymizeUaPlugin = importResult[3].default
  console.log('[DEBUG] Setting up puppeteer plugins...')
  puppeteer.use(StealthPlugin())
  puppeteer.use(LaodengPlugin())
  puppeteer.use(AnonymizeUaPlugin({ makeWindows: false }))
  console.log('[DEBUG] initPuppeteer completed')
  return {
    puppeteer,
    StealthPlugin,
    LaodengPlugin,
    AnonymizeUaPlugin
  }
}

const commonJobConditionConfig = readConfigFile('common-job-condition-config.json')
const fieldsForUseCommonConfig = readConfigFile('boss.json').fieldsForUseCommonConfig ?? {}

const targetCompanyList = (
  !fieldsForUseCommonConfig.expectCompanies ?
    readConfigFile('target-company-list.json')
    :
    commonJobConditionConfig.expectCompanies
).filter(it => !!it.trim());
const combineRecommendJobFilterType = readConfigFile('boss.json').combineRecommendJobFilterType ?? CombineRecommendJobFilterType.ANY_COMBINE

const anyCombineRecommendJobFilter = readConfigFile('boss.json').anyCombineRecommendJobFilter
const staticCombineRecommendJobFilterConditions = readConfigFile('boss.json').staticCombineRecommendJobFilterConditions ?? []
let isSkipEmptyConditionForCombineRecommendJobFilter = readConfigFile('boss.json').isSkipEmptyConditionForCombineRecommendJobFilter
if (!checkAnyCombineBossRecommendFilterHasCondition(anyCombineRecommendJobFilter)) {
  isSkipEmptyConditionForCombineRecommendJobFilter = false
}
const expectJobRegExpStr = readConfigFile('boss.json').expectJobRegExpStr
const jobNotMatchStrategy = readConfigFile('boss.json').jobNotMatchStrategy ?? MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS

const expectCityNotMatchStrategy = readConfigFile('boss.json').expectCityNotMatchStrategy ?? MarkAsNotSuitOp.NO_OP
const expectCityList = (
  !fieldsForUseCommonConfig.city ?
    readConfigFile('boss.json').expectCityList
    :
    commonJobConditionConfig.expectCityList
) ?? []

/**
 * 检查职位是否匹配期望城市列表（支持城市-区域格式）
 * @param {string} cityName - 职位所在城市
 * @param {string} areaDistrict - 职位所在区域/区县
 * @param {string[]} expectCities - 期望城市列表（可能包含 "城市-区域" 格式）
 * @returns {boolean} - 是否匹配
 */
/**
 * 检查职位是否匹配期望城市列表（支持城市-区域格式）
 * @param {string} cityName - 职位所在城市
 * @param {string} areaDistrict - 职位所在行政区（如"西湖区"）
 * @param {string} businessDistrict - 职位所在商圈（如"西溪"）
 * @param {string[]} expectCities - 期望城市列表（可能包含 "城市-区域" 格式）
 * @returns {boolean} - 是否匹配
 */
function checkCityMatch(cityName, areaDistrict, businessDistrict, expectCities) {
  console.log(`[CityMatch] 检查: cityName=${cityName}, areaDistrict=${areaDistrict}, businessDistrict=${businessDistrict}, expectCities=${JSON.stringify(expectCities)}`)
  
  if (!Array.isArray(expectCities) || expectCities.length === 0) {
    console.log(`[CityMatch] 期望城市列表为空，返回true`)
    return true
  }
  
  // 解析期望城市配置
  const expectCitiesOnly = [] // 只配置了城市，没有配置区域
  const expectCityDistrictMap = new Map() // 配置了城市+行政区
  const expectCityBusinessMap = new Map() // 配置了城市+行政区+商圈
  
  for (const item of expectCities) {
    if (typeof item !== 'string') continue
    
    if (item.includes('-')) {
      // 格式: "城市-区域" 或 "城市-区域-商圈"
      const parts = item.split('-')
      const city = parts[0]
      const district = parts[1] // 行政区
      
      if (!expectCityDistrictMap.has(city)) {
        expectCityDistrictMap.set(city, new Set())
      }
      expectCityDistrictMap.get(city).add(district)
      
      // 如果有商圈信息
      if (parts.length >= 3) {
        const business = parts[2]
        const key = `${city}-${district}`
        if (!expectCityBusinessMap.has(key)) {
          expectCityBusinessMap.set(key, new Set())
        }
        expectCityBusinessMap.get(key).add(business)
      }
    } else {
      // 只有城市名
      expectCitiesOnly.push(item)
    }
  }
  
  console.log(`[CityMatch] 解析后: expectCitiesOnly=${JSON.stringify(expectCitiesOnly)}`)
  
  // 1. 如果只配置了城市名，检查城市名是否匹配
  if (expectCitiesOnly.includes(cityName)) {
    console.log(`[CityMatch] 城市名${cityName}在expectCitiesOnly中，返回true`)
    return true
  }
  
  // 2. 如果配置了城市+行政区
  if (expectCityDistrictMap.has(cityName)) {
    const expectDistricts = expectCityDistrictMap.get(cityName)
    console.log(`[CityMatch] 找到城市${cityName}的期望区域: ${[...expectDistricts].join(',')}`)
    
    // 检查行政区是否匹配
    // areaDistrict 是行政区，如"西湖区"
    if (areaDistrict && expectDistricts.has(areaDistrict)) {
      console.log(`[CityMatch] 行政区匹配: ${areaDistrict}`)
      
      // 如果配置了商圈，再检查商圈
      const key = `${cityName}-${areaDistrict}`
      if (expectCityBusinessMap.has(key)) {
        const expectBusinesses = expectCityBusinessMap.get(key)
        console.log(`[CityMatch] 需要匹配商圈: ${[...expectBusinesses].join(',')}`)
        
        if (businessDistrict && expectBusinesses.has(businessDistrict)) {
          console.log(`[CityMatch] 商圈匹配: ${businessDistrict}，返回true`)
          return true
        } else {
          console.log(`[CityMatch] 商圈不匹配: 职位商圈=${businessDistrict}, 期望商圈=${[...expectBusinesses].join(',')}，返回false`)
          return false
        }
      }
      
      console.log(`[CityMatch] 行政区匹配且未配置商圈筛选，返回true`)
      return true
    }
    
    // 3. 行政区不匹配，但可能用户配置的是商圈名（兼容旧数据）
    if (businessDistrict && expectDistricts.has(businessDistrict)) {
      console.log(`[CityMatch] 通过商圈名匹配到区域: ${businessDistrict}，返回true`)
      return true
    }
    
    console.log(`[CityMatch] 行政区不匹配: 职位行政区=${areaDistrict}, 期望行政区=${[...expectDistricts].join(',')}，返回false`)
    return false
  }
  
  console.log(`[CityMatch] 城市名${cityName}不匹配，返回false`)
  return false
}

const strategyScopeOptionWhenMarkJobCityNotMatch = readConfigFile('boss.json').strategyScopeOptionWhenMarkJobCityNotMatch ?? StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB

// salary
const expectSalaryLow = parseFloat(
  !fieldsForUseCommonConfig.salary ? 
    readConfigFile('boss.json').expectSalaryLow
    :
    commonJobConditionConfig.expectSalaryLow
) || null
const expectSalaryHigh = parseFloat(
  !fieldsForUseCommonConfig.salary ? 
    readConfigFile('boss.json').expectSalaryHigh
    :
    commonJobConditionConfig.expectSalaryHigh
) || null
const expectSalaryCalculateWay = (
  !fieldsForUseCommonConfig.salary ?
    readConfigFile('boss.json').expectSalaryCalculateWay
    :
    commonJobConditionConfig.expectSalaryCalculateWay
) ?? SalaryCalculateWay.MONTH_SALARY
const expectSalaryNotMatchStrategy = readConfigFile('boss.json').expectSalaryNotMatchStrategy ?? MarkAsNotSuitOp.NO_OP
const isSalaryFilterEnabled = expectSalaryLow || expectSalaryHigh
const strategyScopeOptionWhenMarkSalaryNotMatch = readConfigFile('boss.json').strategyScopeOptionWhenMarkSalaryNotMatch ?? StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB

// work exp
let expectWorkExpList = readConfigFile('boss.json').expectWorkExpList ?? []
const expectWorkExpListSet = new Set(expectWorkExpList)
if (
  expectWorkExpListSet.has('应届生') ||
  expectWorkExpListSet.has('在校生')
) {
  expectWorkExpListSet.delete('应届生')
  expectWorkExpListSet.delete('在校生')
  expectWorkExpListSet.add('在校/应届')
}
expectWorkExpList = Array.from(expectWorkExpListSet)

const expectWorkExpNotMatchStrategy = readConfigFile('boss.json').expectWorkExpNotMatchStrategy ?? MarkAsNotSuitOp.NO_OP
const strategyScopeOptionWhenMarkJobWorkExpNotMatch = readConfigFile('boss.json').strategyScopeOptionWhenMarkJobWorkExpNotMatch ?? StrategyScopeOptionWhenMarkJobNotMatch.ONLY_COMPANY_MATCHED_JOB

let jobDetailRegExpMatchLogic = (
  !fieldsForUseCommonConfig.jobDetail ?
    readConfigFile('boss.json').jobDetailRegExpMatchLogic
    :
    commonJobConditionConfig.jobDetailRegExpMatchLogic
) ?? JobDetailRegExpMatchLogic.EVERY

const markAsNotActiveSelectedTimeRange = (() => {
  let n = readConfigFile('boss.json').markAsNotActiveSelectedTimeRange
  if (
    typeof n !== 'number' || isNaN(parseInt(n)) || n >= activeDescList.length || n < 0
  ) {
    n = 7
  }
  return n
})()
const jobNotActiveStrategy = (() => {
  let value = readConfigFile('boss.json').jobNotActiveStrategy ?? MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS
  if (markAsNotActiveSelectedTimeRange === 0) {
    value = MarkAsNotSuitOp.NO_OP
  }
  return value
})()

let {
  expectJobNameRegExpStr,
  expectJobTypeRegExpStr,
  expectJobDescRegExpStr,
} = !fieldsForUseCommonConfig.jobDetail ? readConfigFile('boss.json') : commonJobConditionConfig

// 调试日志：显示职位过滤配置来源和值
console.log('[JobFilter Config] Source:', !fieldsForUseCommonConfig.jobDetail ? 'boss.json' : 'common-job-condition-config.json')
console.log('[JobFilter Config] fieldsForUseCommonConfig.jobDetail:', fieldsForUseCommonConfig.jobDetail)
console.log('[JobFilter Config] expectJobTypeRegExpStr:', expectJobTypeRegExpStr)
console.log('[JobFilter Config] expectJobNameRegExpStr:', expectJobNameRegExpStr)
console.log('[JobFilter Config] expectJobDescRegExpStr:', expectJobDescRegExpStr)
console.log('[JobFilter Config] jobDetailRegExpMatchLogic:', jobDetailRegExpMatchLogic)

if (
  !fieldsForUseCommonConfig.jobDetail &&
  expectJobRegExpStr &&
  !expectJobNameRegExpStr &&
  !expectJobTypeRegExpStr &&
  !expectJobDescRegExpStr
) {
  expectJobNameRegExpStr = expectJobRegExpStr
  expectJobTypeRegExpStr = expectJobRegExpStr
  expectJobDescRegExpStr = expectJobRegExpStr
  console.log('[JobFilter Config] Fallback to legacy expectJobRegExpStr:', expectJobRegExpStr)
}

if (
  [
    expectJobNameRegExpStr,
    expectJobTypeRegExpStr,
    expectJobDescRegExpStr,
  ].map(it => Boolean(it?.trim())).every(it => !it)
) {
  jobDetailRegExpMatchLogic = JobDetailRegExpMatchLogic.EVERY
  console.warn('[JobFilter Config] WARNING: All job detail regexp are empty! All jobs will be matched.')
}

let {
  jobSourceList
} = readConfigFile('boss.json')
const normalizedJobSource = []
const addedSourceSet = new Set()
for (const source of (jobSourceList ?? [])) {
  if (addedSourceSet.has(source.type)) {
    continue
  }
  if (!source?.enabled) {
    continue
  }
  if (source.type === 'search') {
    for (const searchOption of (source.children ?? [])) {
      if (!searchOption.enabled || !searchOption.keyword?.trim()) {
        continue
      }
      const key = [
        source.type,
        searchOption.keyword.trim()
      ].join('__')
      if (addedSourceSet.has(key)) {
        continue
      }
      normalizedJobSource.push({
        type: 'search',
        keyword: searchOption.keyword.trim()
      })
      addedSourceSet.add(key)
    }
    addedSourceSet.add(source.type)
  }
  else {
    normalizedJobSource.push({
      type: source.type,
    })
    addedSourceSet.add(source.type)
  }
}
if (!normalizedJobSource?.length) {
  normalizedJobSource.push({
    type: 'expect'
  })
}
const localStoragePageUrl = `https://www.zhipin.com/desktop/`
const recommendJobPageUrl = `https://www.zhipin.com/web/geek/jobs`

const expectCompanySet = new Set(targetCompanyList)
const enableCompanyAllowList = Boolean(expectCompanySet.size)
const blockCompanyNameRegExpStr = (
  !fieldsForUseCommonConfig.blockCompanyNameRegExpStr ?
    readConfigFile('boss.json').blockCompanyNameRegExpStr
    :
    commonJobConditionConfig.blockCompanyNameRegExpStr
) ?? ''
const blockCompanyNameRegExp = (() => {
  if (!blockCompanyNameRegExpStr?.trim()) {
    return null
  }
  try {
    return new RegExp(blockCompanyNameRegExpStr, 'im')
  }
  catch {
    return null
  }
})()
const blockCompanyNameRegMatchStrategy = readConfigFile('boss.json').blockCompanyNameRegMatchStrategy ?? MarkAsNotSuitOp.NO_OP

// 全局公司黑名单（最高优先级，无条件屏蔽）
const globalBlockCompanyNameRegExpStr = commonJobConditionConfig.globalBlockCompanyNameRegExpStr ?? ''
const globalBlockCompanyNameRegExp = (() => {
  if (!globalBlockCompanyNameRegExpStr?.trim()) {
    return null
  }
  try {
    return new RegExp(globalBlockCompanyNameRegExpStr, 'im')
  }
  catch {
    return null
  }
})()
// 检查公司是否在全局黑名单中
const isCompanyInGlobalBlockList = (companyName) => {
  if (!globalBlockCompanyNameRegExp || !companyName) {
    return false
  }
  return globalBlockCompanyNameRegExp.test(companyName.toLowerCase())
}

// 打招呼消息配置
const GreetingMessageMode = {
  DEFAULT: 0,      // 使用 BOSS 默认问候语
  CUSTOM: 1,       // 使用固定自定义消息
  AI_GENERATED: 2  // 使用 AI 根据 JD 和简历自动生成
}
const greetingMessageConfig = {
  mode: Number(readConfigFile('boss.json').greetingMessageMode ?? GreetingMessageMode.DEFAULT),
  customMessage: readConfigFile('boss.json').greetingMessage ?? '',
  customPrompt: readConfigFile('boss.json').greetingMessagePrompt ?? ''
}

// 打印打招呼消息配置（调试用）
console.log('[GreetingConfig] 打招呼消息配置:', {
  mode: greetingMessageConfig.mode,
  modeType: typeof greetingMessageConfig.mode,
  customMessageLength: greetingMessageConfig.customMessage?.length ?? 0,
  hasCustomPrompt: !!greetingMessageConfig.customPrompt
})

/**
 * @type { import('puppeteer').Browser }
 */
let browser
/**
 * @type { import('puppeteer').Page }
 */
let page

const blockBossNotNewChat = new Set()
const blockBossNotActive = new Set()
const blockJobNotSuit = new Set()

// 默认的 AI 打招呼消息生成 Prompt
const DEFAULT_GREETING_PROMPT = `你是一位专业的求职助手。请根据以下职位信息（JD）和我的简历，为我生成一句简洁、专业且个性化的打招呼消息。

**要求：**
1. 开头使用"您好"或"BOSS您好"等敬语
2. 简要提及与职位相关的核心技能或经验（2-3点）
3. 表达对职位的兴趣和应聘意向
4. 结尾可包含"期待回复"或"希望能有机会合作"等话术
5. 字数控制在 50-100 字
6. 语气谦逊、专业，避免过度自信

**职位信息（JD）：**
{{JOB_DESCRIPTION}}

**我的简历：**
{{RESUME_CONTENT}}

请仅回复生成的打招呼消息，不要包含任何解释或其他内容。`

/**
 * 使用 AI 根据 JD 和简历生成打招呼消息
 * @param {Object} jobData - 职位数据
 * @param {Object} resumeData - 简历数据
 * @returns {Promise<string|null>} - 生成的消息或 null
 */
async function generateGreetingMessageWithAI(jobData, resumeData) {
  try {
    // 读取 LLM 配置
    const llmConfigList = readConfigFile('llm.json')
    if (!Array.isArray(llmConfigList) || llmConfigList.length === 0) {
      console.log('[AI Greeting] 未找到 LLM 配置，跳过 AI 生成')
      return null
    }
    
    // 使用第一个启用的模型
    const llmConfig = llmConfigList.find(it => it.enabled) || llmConfigList[0]
    if (!llmConfig) {
      console.log('[AI Greeting] 未找到可用的 LLM 配置，跳过 AI 生成')
      return null
    }
    
    // 准备简历内容
    let resumeContent = ''
    if (resumeData) {
      resumeContent = JSON.stringify(resumeData, null, 2)
    } else {
      // 尝试从配置文件读取
      const resumeList = readConfigFile('resumes.json')
      if (Array.isArray(resumeList) && resumeList.length > 0) {
        resumeContent = JSON.stringify(resumeList[0], null, 2)
      }
    }
    
    if (!resumeContent) {
      console.log('[AI Greeting] 未找到简历内容，跳过 AI 生成')
      return null
    }
    
    // 准备 JD 内容
    const jobDesc = jobData?.jobInfo?.postDescription || jobData?.postDescription || ''
    const jobName = jobData?.jobInfo?.jobName || jobData?.jobName || ''
    const jobType = jobData?.jobInfo?.positionName || jobData?.positionName || ''
    const companyName = jobData?.brandName || jobData?.jobInfo?.brandName || ''
    
    const jdContent = `职位名称：${jobName}
职位类型：${jobType}
公司名称：${companyName}
职位描述：${jobDesc}`
    
    // 使用自定义 prompt 或默认 prompt
    const promptTemplate = greetingMessageConfig.customPrompt?.trim() || DEFAULT_GREETING_PROMPT
    const prompt = promptTemplate
      .replace(/{{JOB_DESCRIPTION}}/g, jdContent)
      .replace(/{{RESUME_CONTENT}}/g, resumeContent)
    
    console.log('[AI Greeting] 正在生成打招呼消息...')
    
    // 调用 AI
    const chatList = [
      {
        role: 'system',
        content: prompt
      },
      {
        role: 'user',
        content: '请根据上述职位信息和简历，生成一句专业的打招呼消息。'
      }
    ]
    
    const completion = await completes(
      {
        baseURL: llmConfig.providerCompleteApiUrl,
        apiKey: llmConfig.providerApiSecret,
        model: llmConfig.model
      },
      chatList
    )
    
    const generatedText = completion?.choices?.[0]?.message?.content?.trim()
    
    if (!generatedText) {
      console.log('[AI Greeting] AI 返回内容为空')
      return null
    }
    
    console.log('[AI Greeting] 生成成功:', generatedText.substring(0, 50) + '...')
    return generatedText
  } catch (err) {
    console.error('[AI Greeting] AI 生成失败:', err.message)
    return null
  }
}

async function markJobAsNotSuitInRecommendPage (reasonCode) {
  /**
   * @type {{chosenReasonInUi?: { code: number, text: string}}}
   */
  const result = {}
  const notSuitableFeedbackButtonProxy = await page.$('.job-detail-box .job-detail-operate .not-suitable')
  if (notSuitableFeedbackButtonProxy) {
    await notSuitableFeedbackButtonProxy.evaluate(el => {
      el.scrollIntoView({
        block: 'center'
      })
    })
    await sleep(200)
    await notSuitableFeedbackButtonProxy.click()
    const rawReasonResData = (await (await page.waitForResponse(
      response => {
        if (
          response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/negativefeedback/reasons.json')
        ) {
          return true
        }
        return false
      }
    )).json())?.zpData?.result ?? [];
    const reasonCodeToTextMap = await readStorageFile('job-not-suit-reason-code-to-text-cache.json')
    for(const it of rawReasonResData) {
      reasonCodeToTextMap[it.code] = it.text?.content ?? ''
    }
    await writeStorageFile('job-not-suit-reason-code-to-text-cache.json', reasonCodeToTextMap)
    await sleepWithRandomDelay(2000)
    const chooseReasonDialogProxy = await(async() => {
      const alls = await page.$$('.zp-dialog-wrap.zp-feedback-dialog')
      return alls?.[alls.length - 1]
    })()
    let isOptionChosen = false
    if (chooseReasonDialogProxy) {
      switch (reasonCode) {
        case MarkAsNotSuitReason.COMPANY_NAME_NOT_SUIT: {
          const opProxy = (await chooseReasonDialogProxy.$(`.zp-type-item[title*="公司"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="面试过/入职过"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="重复推荐"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title*="距离"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title*="薪资"]`))
          if (opProxy) {
            await opProxy.click()
            isOptionChosen = true
          }
          break
        }
        case MarkAsNotSuitReason.BOSS_INACTIVE: {
          const opProxy = (await chooseReasonDialogProxy.$(`.zp-type-item[title="BOSS活跃度低"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="职位停招/招满"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="面试过/入职过"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="重复推荐"]`))
          if (opProxy) {
            await opProxy.click()
            isOptionChosen = true
          }
          break
        }
        case MarkAsNotSuitReason.JOB_WORK_EXP_NOT_SUIT:
        case MarkAsNotSuitReason.JOB_CITY_NOT_SUIT: {
          const opProxy = (await chooseReasonDialogProxy.$(`.zp-type-item[title$="城市"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title*="距离"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title*="公司"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="面试过/入职过"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="重复推荐"]`))
          if (opProxy) {
            await opProxy.click()
            isOptionChosen = true
          }
          break
        }
        case MarkAsNotSuitReason.JOB_SALARY_NOT_SUIT: {
          const opProxy = (await chooseReasonDialogProxy.$(`.zp-type-item[title*="薪资"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title$="城市"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title*="距离"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title*="公司"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="面试过/入职过"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="重复推荐"]`))
          if (opProxy) {
            await opProxy.click()
            isOptionChosen = true
          }
          break
        }
        case MarkAsNotSuitReason.JOB_NOT_SUIT:
        default: {
          const opProxy = (await chooseReasonDialogProxy.$(`.zp-type-item[title$="职位"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="面试过/入职过"]`))
            ?? (await chooseReasonDialogProxy.$(`.zp-type-item[title="重复推荐"]`))
          if (opProxy) {
            await opProxy.click()
            isOptionChosen = true
          }
          break
        }
      }

      if (isOptionChosen) {
        await sleepWithRandomDelay(1500)
        const confirmButtonProxy = await chooseReasonDialogProxy.$(`.zp-dialog-footer .zp-btn.zp-btn-sure`)
        await confirmButtonProxy.click()
        const response = await page.waitForResponse(
          response => {
            if (
              response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/negativefeedback/save.json')
            ) {
              return true
            }
            return false
          }
        )
        /**
         * scene=4&code=41&feedbackReason=&securityId=
         */
        const requestBody = response.request().postData()
        const chosenCode = Number(new URLSearchParams(requestBody).get('code'))
        if (chosenCode) {
          result.chosenReasonInUi = {
            code: chosenCode,
            text: reasonCodeToTextMap[chosenCode]
          }
        }
      } else {
        const cancelButtonProxy = await chooseReasonDialogProxy.$(`.zp-close`)
        await cancelButtonProxy.click()
      }

      await sleepWithRandomDelay(2500)
    }
  }
  return result
}

export function testIfJobTitleOrDescriptionSuit (jobInfo, matchLogic) {
  let isJobNameSuit = matchLogic === JobDetailRegExpMatchLogic.SOME ? false : true
  try {
    if (expectJobNameRegExpStr?.trim()) {
      const regExp = new RegExp(expectJobNameRegExpStr, 'im')
      isJobNameSuit = regExp.test(jobInfo.jobName?.replace(/\n/g, '') ?? '')
    }
  } catch {
  }
  let isJobTypeSuit = matchLogic === JobDetailRegExpMatchLogic.SOME ? false : true
  try {
    if (expectJobTypeRegExpStr?.trim()) {
      const regExp = new RegExp(expectJobTypeRegExpStr, 'im')
      isJobTypeSuit = regExp.test(jobInfo.positionName?.replace(/\n/g, '') ?? '')
    }
  } catch {
  }
  let isJobDescSuit = matchLogic === JobDetailRegExpMatchLogic.SOME ? false : true
  try {
    if (expectJobDescRegExpStr?.trim()) {
      const regExp = new RegExp(expectJobDescRegExpStr, 'im')
      isJobDescSuit = regExp.test(jobInfo.postDescription?.replace(/\n/g, '') ?? '')
    }
  } catch {
  }
  
  const result = matchLogic === JobDetailRegExpMatchLogic.SOME 
    ? (isJobNameSuit || isJobTypeSuit || isJobDescSuit)
    : (isJobNameSuit && isJobTypeSuit && isJobDescSuit)
  
  // 调试日志：显示匹配详情
  console.log(`[JobFilter Match] jobName: ${jobInfo.jobName}, positionName: ${jobInfo.positionName}`)
  console.log(`[JobFilter Match] regexp - name: ${expectJobNameRegExpStr}, type: ${expectJobTypeRegExpStr}, desc: ${expectJobDescRegExpStr}`)
  console.log(`[JobFilter Match] result - name: ${isJobNameSuit}, type: ${isJobTypeSuit}, desc: ${isJobDescSuit}, final: ${result}`)
  
  return result
}

async function setFilterCondition (selectedFilters) {
  const {
    cityList = [],
    salaryList = [],
    experienceList = [],
    degreeList = [],
    scaleList = [],
    industryList = []
  } = selectedFilters

  const placeholderTexts = ['城市', '薪资待遇', '工作经验', '学历要求', '公司行业', '公司规模']
  const optionKaPrefixes = ['switch_city_dialog_open', 'sel-job-rec-salary-', 'sel-job-rec-exp-', 'sel-job-rec-degree-', 'sel-industry-', 'sel-job-rec-scale-']
  const conditionArr = [cityList, salaryList, experienceList, degreeList, industryList, scaleList]

  console.log('current filter condition----')
  for (let i = 0; i < placeholderTexts.length; i++) {
    const text = placeholderTexts[i]
    const condition = conditionArr[i]
    console.log(`${text}：`, condition.length === 0 ? '不限' : condition.map(code => {
      if (text === '公司行业') {
        return industryFilterConditionsMapByCode[code]?.name ?? code
      } else {
        return jobFilterConditionsMapByCode[code]?.name ?? code
      }
    }).join('，'))
  }
  console.log('----------------------------')
  for(let i = 0; i < placeholderTexts.length; i++) {
    const placeholderText = placeholderTexts[i]
    const filterDropdownProxy = await (async () => {
      const jsHandle = (await page.evaluateHandle((placeholderText) => {
        if (placeholderText === '城市') {
          return document.querySelector('.page-jobs-main .filter-condition-inner [ka="switch_city_dialog_open"]')
        }
        else {
          const filterBar = document.querySelector('.page-jobs-main .filter-condition-inner')
          const dropdownEntry = filterBar.__vue__.$children.find(it => it.placeholder === placeholderText)
          return dropdownEntry?.$el
        }
      }, placeholderText))?.asElement();
      return jsHandle
    })()
    if (!filterDropdownProxy) {
      continue
    }

    const currentFilterConditions = conditionArr[i];
    const filterDropdownCssList = await filterDropdownProxy.evaluate(el => Array.from(el.classList));
    if (placeholderText === '城市') {
      const onPageSelectedCity = filterDropdownCssList.includes('active') ? (await filterDropdownProxy.evaluate(el => el.textContent.trim())) : null
      if (!onPageSelectedCity && !currentFilterConditions.length) {
        continue
      } else if (onPageSelectedCity === (currentFilterConditions[0] ?? null)) {
        continue
      } else {
        if (!currentFilterConditions.length) {
          const clearButtonHandle = await page.$(`.page-jobs-main .filter-condition-inner [ka="empty-filter"]`)
          await clearButtonHandle.click()
        }
        else {
          await filterDropdownProxy?.click()
          await page.waitForFunction(() => {
            const dialogEl = document.querySelector('.city-select-dialog')
            return dialogEl && window.getComputedStyle(dialogEl).display !== 'none'
          })
          const citySelectWrapperProxy = await page.waitForSelector('.city-select-wrapper')
          let targetCityElJsHandle = (await page.evaluateHandle((cityName) => {
            const targetCityEl = [...document.querySelectorAll('.city-select-dialog .city-select-wrapper ul.city-list-hot li')].find(it => it.textContent.trim() === cityName) ?? null
            return targetCityEl
          }, currentFilterConditions[0]))?.asElement()
          if (!targetCityElJsHandle) {
            const targetCityItem = flattedCityList.find(it => it.name === currentFilterConditions[0])
            if (!targetCityItem) {
              // unexpected condition
              continue
            }
            const firstChar = targetCityItem.firstChar
            const targetCityCharListEntryHandle = await page.$(`xpath///*[contains(@class, "city-select-dialog")]//*[contains(@class, "city-select-wrapper")]//ul[contains(@class, "city-char-list")]//li[contains(text(), '${firstChar.toUpperCase()}')]`)
            await targetCityCharListEntryHandle.click()
            targetCityElJsHandle = (await page.evaluateHandle((cityName) => {
              const targetCityEl = [...document.querySelectorAll('.city-select-dialog .city-select-wrapper .list-select-list a')].find(it => it.textContent.trim() === cityName) ?? null
              return targetCityEl
            }, currentFilterConditions[0]))?.asElement()
          }
          if (!targetCityElJsHandle) {
            // unexpected condition
            continue
          }
          await targetCityElJsHandle.click()
          await sleep(1000)
        }
      }
    }
    else {
      if (!filterDropdownCssList.includes('is-select') && !currentFilterConditions.length) {
        continue
      } else {
        await filterDropdownProxy.scrollIntoView()
        const filterDropdownElBBox = await filterDropdownProxy.boundingBox()
        await page.mouse.move(
          filterDropdownElBBox.x + filterDropdownElBBox.width / 2,
          filterDropdownElBBox.y + filterDropdownElBBox.height / 2,
        )
        await sleepWithRandomDelay(500)

        const optionKaPrefix = optionKaPrefixes[i]
        if (!currentFilterConditions.length) {
          if (placeholderText === '公司行业') {
            const activeOptionElAtCurrentFilterProxyList = await page.$$(`.page-jobs-main .filter-condition-inner .active[ka^="${optionKaPrefix}"]`)
            for (const it of activeOptionElAtCurrentFilterProxyList) {
              await it.click()
            }
          } else {
            // select 不限 immediately
            const buxianOptionElProxy = await page.$(`.page-jobs-main .filter-condition-inner [ka="${optionKaPrefix}${0}"]`)
            await buxianOptionElProxy.click()
          }
        } else {
          //#region uncheck options perviously checked but not existed in current filter.
          const activeOptionElAtCurrentFilterProxyList = await page.$$(`.page-jobs-main .filter-condition-inner .active[ka^="${optionKaPrefix}"]`)
          const activeOptionValues = (await Promise.all(
            activeOptionElAtCurrentFilterProxyList.map(elProxy => {
              return elProxy.evaluate((el) => {
                return el.getAttribute('ka')
              })
            })
          )).map(it => it.replace(optionKaPrefix, '')).map(Number)
          if (placeholderText !== '薪资待遇') {
            for(let i = 0; i < activeOptionValues.length; i++) {
              let activeValue
              if (placeholderText === '公司行业') {
                activeValue = industryFilterConditionsMapByIndex[activeOptionValues[i]]?.code
              } else {
                activeValue = activeOptionValues[i]
              }
              const activeOptionElProxy = activeOptionElAtCurrentFilterProxyList[i]
              if (!currentFilterConditions.includes(activeValue)) {
                await activeOptionElProxy.click()
              }
            }
          }
          //#endregion
          //#region only click the one which we need check, don't change already checked.
          const conditionToCheck = currentFilterConditions.filter(it => {
            if (placeholderText === '公司行业') {
              return !activeOptionValues.map(value => industryFilterConditionsMapByIndex[value].code).includes(it);
            } else {
              return !activeOptionValues.includes(it)
            }
          })
          for(let j = 0; j < conditionToCheck.length; j++) {
            let optionValue
            if (placeholderText === '公司行业') {
              optionValue = industryFilterConditionCodeToIndexMap[conditionToCheck[j]]
            } else {
              optionValue = conditionToCheck[j]
            }
            await sleepWithRandomDelay(500)
            await filterDropdownProxy.scrollIntoView()
            const filterDropdownElBBox = await filterDropdownProxy.boundingBox()
            await page.mouse.move(
              filterDropdownElBBox.x + filterDropdownElBBox.width / 2,
              filterDropdownElBBox.y + filterDropdownElBBox.height / 2,
            )
            await sleepWithRandomDelay(500)
            const optionElProxy = await page.$(`.page-jobs-main .filter-condition-inner [ka="${optionKaPrefix}${optionValue}"]`)
            if (!optionElProxy) {
              continue;
            }
            await optionElProxy.click()
          }
          //#endregion
          //#region move out dropdown entry to make dropdown hidden
          const navBarLogoElProxy = await page.$(`[ka="header-home-logo"]`)
          if (navBarLogoElProxy) {
            const navBarLogoElBBox = await navBarLogoElProxy.boundingBox()
            await page.mouse.move(
              navBarLogoElBBox.x + navBarLogoElBBox.width / 2,
              navBarLogoElBBox.y + navBarLogoElBBox.height / 2,
            )
          }
          //#endregion
        }
        await sleepWithRandomDelay(500)
      }
    }
  }
}

async function toRecommendPage (hooks) {
  let userInfoPromise = page.waitForResponse((response) => {
      if (response.url().startsWith('https://www.zhipin.com/wapi/zpuser/wap/getUserInfo.json')) {
        return true
      }
      return false
    }, { timeout: 120 * 1000 }).then((res) => {
      return res.json()
    })
  page.goto(recommendJobPageUrl, { timeout: 1 * 1000 }).catch(e => { void e })
  await sleep(3000)
  await page.waitForFunction(() => {
    return document.readyState === 'complete'
  }, { timeout: 120 * 1000 })
  if (
    page.url().startsWith('https://www.zhipin.com/web/common/403.html') ||
    page.url().startsWith('https://www.zhipin.com/web/common/error.html')
  ) {
    throw new Error("ACCESS_IS_DENIED")
  }

  await page.waitForFunction(({ recommendJobPageUrl }) => {
    return location.href.startsWith(recommendJobPageUrl) && document.readyState === 'complete'
  }, undefined, { recommendJobPageUrl })

  hooks.pageLoaded?.call()

  let userInfoResponse = await userInfoPromise
  await hooks.userInfoResponse?.promise(userInfoResponse)
  if (userInfoResponse?.code !== 0) {
    autoStartChatEventBus.emit('LOGIN_STATUS_INVALID', {
      userInfoResponse
    })
    writeStorageFile('boss-cookies.json', [])
    throw new Error("LOGIN_STATUS_INVALID")
  } else {
    await storeStorage(page).catch(() => void 0)
  }

  const computedSourceList = []
  for (const source of normalizedJobSource) {
    switch (source.type) {
      case 'recommend': {
        computedSourceList.push({
          type: source.type,
          selector: RECOMMEND_JOB_ENTRY_SELECTOR,
          async getIsCurrentActiveSource () {
            return await page.evaluate(
              ({ RECOMMEND_JOB_ENTRY_SELECTOR }) => {
                return document.querySelector(RECOMMEND_JOB_ENTRY_SELECTOR).classList.contains('active')
              }, {
                RECOMMEND_JOB_ENTRY_SELECTOR
              }
            )
          },
          async setToActiveSource() {
            // not first navigation and should choose a job (except job)
            // click first expect job
            const expectJobTabHandler = await page.$(RECOMMEND_JOB_ENTRY_SELECTOR)
            await expectJobTabHandler.click() // switch to first condition
          }
        })
        continue
      }
      case 'expect': {
        await page.waitForSelector(USER_SET_EXPECT_JOB_ENTRIES_SELECTOR)
        const allExpectJobEntryHandles = await page.$$(USER_SET_EXPECT_JOB_ENTRIES_SELECTOR)
        allExpectJobEntryHandles.forEach((it, index) => {
          computedSourceList.push({
            type: source.type,
            selector: `${USER_SET_EXPECT_JOB_ENTRIES_SELECTOR}:nth-child(${index + 1})`,
            async getIsCurrentActiveSource () {
              return await page.evaluate(
                ({
                  USER_SET_EXPECT_JOB_ENTRIES_SELECTOR,
                  index
                }) => {
                  return document.querySelector(`${USER_SET_EXPECT_JOB_ENTRIES_SELECTOR}:nth-child(${index + 1})`).classList.contains('active')
                }, {
                  USER_SET_EXPECT_JOB_ENTRIES_SELECTOR,
                  index
                }
              )
            },
            async setToActiveSource() {
              // not first navigation and should choose a job (except job)
              // click first expect job
              const expectJobTabHandler = await page.$(`${USER_SET_EXPECT_JOB_ENTRIES_SELECTOR}:nth-child(${index + 1})`)
              await expectJobTabHandler.click() // switch to first condition
            }
          })
        })
        break
      }
      case 'search': {
        computedSourceList.push({
          type: source.type,
          async getIsCurrentActiveSource () {
            const elHandle = await page.$(`.page-jobs-main`)
            const currentKeyWord = await elHandle?.evaluate((el) => {
              return el?.__vue__?.formData?.query
            })
            if (!currentKeyWord) {
              return false
            }
            return currentKeyWord === source.keyword
          },
          async setToActiveSource() {
            await page.waitForSelector(SEARCH_BOX_SELECTOR)
            const inputHandle = await page.$(`${SEARCH_BOX_SELECTOR} input`)
            await inputHandle.focus()
            await sleep(100)
            let currentValue = await inputHandle.evaluate(el => el.value)
            while (currentValue) {
              await inputHandle.press('Backspace')
              currentValue = await inputHandle.evaluate(el => el.value)
            }
            await inputHandle.type(source.keyword?.trim() || '', { delay: 100 })
            await sleep(500)
            await inputHandle.press('Enter')
          }
        })
      }
    }
  }

  let currentSourceIndex = 0
  afterPageLoad: while (true) {
    // check set security question tip modal
    let setSecurityQuestionTipModelProxy
    try {
      setSecurityQuestionTipModelProxy = await page.waitForSelector('.dialog-wrap.dialog-account-safe', { timeout: 3 * 1000 })
    }
    catch(err) {
      console.log(`cannot find set security question tip modal, just continue`)
    }
    if (
      setSecurityQuestionTipModelProxy
    ) {
      await sleep(1000)
      setSecurityQuestionTipModelProxy = await page.$('.dialog-wrap.dialog-account-safe')
      const closeButtonProxy = await setSecurityQuestionTipModelProxy?.$('.close')

      if (setSecurityQuestionTipModelProxy && closeButtonProxy) {
        await closeButtonProxy.click()
      }
    }

    const filterConditions =
      combineRecommendJobFilterType === CombineRecommendJobFilterType.STATIC_COMBINE
        ? formatStaticCombineFilters(staticCombineRecommendJobFilterConditions)
          : combineFiltersWithConstraintsGenerator(anyCombineRecommendJobFilter)
    let expectJobList
    let filterConditionIndex = -1
    iterateFilterCondition: for (
      const filterCondition of filterConditions
    ) {
      filterConditionIndex++
      console.log(`current filter condition index to apply: ${filterConditionIndex}`, JSON.stringify(filterCondition))
      findInCurrentFilterCondition: while(true) {
        await sleepWithRandomDelay(2500)

        await Promise.all([
          Promise.race([
            page.waitForSelector(USER_SET_EXPECT_JOB_ENTRIES_SELECTOR),
            page.waitForSelector(RECOMMEND_JOB_ENTRY_SELECTOR),
          ]),
          Promise.race([
            page.waitForSelector(".job-list-container .rec-job-list"),
            page.waitForSelector(".recommend-result-job .job-empty-wrapper")
          ])
        ])
        // await page.click(USER_SET_EXPECT_JOB_ENTRIES_SELECTOR)
        await sleep(3000)
        let onPageCurrentSourceIndex = -1
        try {
          for (let i=0; i < computedSourceList.length; i++) {
            const computedSource = computedSourceList[i]
            if (await computedSource.getIsCurrentActiveSource()) {
              onPageCurrentSourceIndex = i
              break
            }
          }
        } catch (frameErr) {
          // 如果页面已导航/刷新，frame 会被分离，需要重启浏览器
          if (frameErr.message?.includes('detached Frame')) {
            console.warn('页面已刷新，需要重启浏览器:', frameErr.message)
            throw new Error('STARTUP_CHAT_ERROR_WITH_UNKNOWN_ERROR')
          }
          throw frameErr
        }
        if (
          (
            combineRecommendJobFilterType === CombineRecommendJobFilterType.STATIC_COMBINE && filterCondition === null
          )
          ||
          (
            combineRecommendJobFilterType === CombineRecommendJobFilterType.ANY_COMBINE &&
            isSkipEmptyConditionForCombineRecommendJobFilter &&
            Object.keys(filterCondition).length &&
            Object.keys(filterCondition).every(k => !filterCondition[k]?.length)
          )
        ) {
          sleep(4000)
          continue iterateFilterCondition
        }
        expectJobList = await page.evaluate(`document.querySelector('.c-expect-select')?.__vue__?.expectList`)
        if (onPageCurrentSourceIndex === currentSourceIndex) {
          // first navigation and can immediately start chat (recommend job)
        } else {
          await computedSourceList[currentSourceIndex].setToActiveSource()
          await page.waitForResponse(
            response => {
              if (
                response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/pc/recommend/job/list.json') ||
                response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/search/joblist.json')
              ) {
                return true
              }
              return false
            }
          );
          await storeStorage(page).catch(() => void 0)
          await sleepWithRandomDelay(2000)
          await waitForSageTimeOrJustContinue({
            tag: 'afterJobSourceChosen',
            hooks
          })
        }
        await sleepWithRandomDelay(1500)
        await setFilterCondition(filterCondition)
        await sleep(1500) // TODO: accurately check if job list request sent and response received after set condition
        await page.waitForFunction(() => {
          return !document.querySelector('.job-recommend-result .job-rec-loading')
        })
        try {
          const { targetJobIndex, targetJobData } = await new Promise(async (resolve, reject) => {
            try {
              let requestNextPagePromiseWithResolver = null
              page.on(
                'request',
                function reqHandler (request) {
                  if (
                    request.url().startsWith('https://www.zhipin.com/wapi/zpgeek/pc/recommend/job/list.json') ||
                    request.url().startsWith('https://www.zhipin.com/wapi/zpgeek/search/joblist.json')
                  ) {
                    requestNextPagePromiseWithResolver = (() => {
                      const o = {}
                      o.promise = new Promise((resolve, reject) => {
                        o.resolve = resolve
                        o.reject = reject
                      })
                      return o
                    })()
                    page.off(reqHandler)

                    page.on(
                      'response',
                      function resHandler (response) {
                        if (response.request() === request) {
                          requestNextPagePromiseWithResolver?.resolve()
                          page.off(resHandler)
                        }
                      }
                    )
                  }
                }
              )
              // job list
              let  recommendJobListElProxy
              try {
                recommendJobListElProxy= await page.waitForSelector('.job-list-container .rec-job-list', { timeout: 5 * 1000 })
              } catch {}
              if (!recommendJobListElProxy){
                await hooks.encounterEmptyRecommendJobList?.promise({
                  pageQuery: await page.evaluate(() => new URL(location.href).searchParams.toString())
                })
                throw new Error('CANNOT_FIND_EXCEPT_JOB_IN_THIS_FILTER_CONDITION')
              }
              let jobListData = []
              async function updateJobListData () {
                jobListData = await page.evaluate(`document.querySelector('.page-jobs-main')?.__vue__?.jobList`)
                // due to city can get from list immediately
                // so just set those job which city is not suit to blockJobNotSuit
                // to skip view detail

                // skip invalid salaryData (兼职、日结、实习 etc)
                jobListData.forEach(it => {
                  const salaryData = parseSalary(it.salaryDesc)
                  if (!salaryData.high || !salaryData.low) {
                    blockJobNotSuit.add(it.encryptJobId)
                  }
                })
                if (
                  (
                    expectCityNotMatchStrategy === MarkAsNotSuitOp.NO_OP && 
                    Array.isArray(expectCityList) &&
                    expectCityList.length
                  ) ||
                  (
                    expectWorkExpNotMatchStrategy === MarkAsNotSuitOp.NO_OP && 
                    Array.isArray(expectWorkExpList) &&
                    expectWorkExpList.length
                  ) ||
                  (
                    strategyScopeOptionWhenMarkSalaryNotMatch === MarkAsNotSuitOp.NO_OP &&
                    isSalaryFilterEnabled
                  )
                ) {
                  console.log(`add job city not suit into blockJobNotSuit set`)
                  for (const it of jobListData) {
                    if (!checkCityMatch(it.cityName, it.areaDistrict, it.businessDistrict, expectCityList)) {
                      blockJobNotSuit.add(it.encryptJobId)
                    }
                  }
                }
              }
              await updateJobListData()

              let hasReachLastPage = false
              let targetJobIndex = -1
              let targetJobData, selectedJobData // they show be same; one is from list, another is from detail
              function checkIfSalarySuit(salaryDesc) {
                const salaryData = parseSalary(salaryDesc)
                if (expectSalaryCalculateWay === SalaryCalculateWay.MONTH_SALARY) {
                  let ourSalaryInterval = [expectSalaryLow ?? null, expectSalaryHigh ?? null]
                  if (ourSalaryInterval.every(it => !isNaN(parseFloat(it)))) {
                    ourSalaryInterval = ourSalaryInterval.sort((a, b) => a - b)
                  }
                  const theirSalaryInterval = [salaryData.low ?? null, salaryData.high ?? null]
                  return hasIntersection(theirSalaryInterval, ourSalaryInterval)
                }
                else if (expectSalaryCalculateWay === SalaryCalculateWay.ANNUAL_PACKAGE) {
                  const salaryDataMonth = salaryData.month || 12
                  let ourSalaryInterval = [expectSalaryLow ?? null, expectSalaryHigh ?? null]
                  if (ourSalaryInterval.every(it => !isNaN(parseFloat(it)))) {
                    ourSalaryInterval = ourSalaryInterval.sort((a, b) => a - b)
                  }
                  const theirSalaryInterval = [salaryData.low ?? null, salaryData.high ?? null].map(
                    it =>
                      it === null ? null : (it * salaryDataMonth / 10)
                  )
                  return hasIntersection(theirSalaryInterval, ourSalaryInterval)
                }
                return true
              }
              function getTempTargetJobIndexToCheckDetail () {
                return jobListData.findIndex(it => {
                  return !blockBossNotNewChat.has(it.encryptBossId) &&
                    !blockBossNotActive.has(it.encryptBossId) &&
                    !blockJobNotSuit.has(it.encryptJobId) &&
                    (
                      (
                        enableCompanyAllowList ?
                          [...expectCompanySet].find(
                            name => it.brandName?.toLowerCase?.()?.includes(name.toLowerCase())
                          )
                          :
                          true
                      ) || (
                        // enter job detail to mark as not suit for city filter
                        (
                          Array.isArray(expectCityList) &&
                          expectCityList.length &&
                          [
                            MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                            MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                          ].includes(expectCityNotMatchStrategy) &&
                          strategyScopeOptionWhenMarkJobCityNotMatch === StrategyScopeOptionWhenMarkJobNotMatch.ALL_JOB
                        ) ? !checkCityMatch(it.cityName, it.areaDistrict, it.businessDistrict, expectCityList) : false
                      ) || (
                        // enter job detail to mark as not suit for work exp filter
                        (
                          Array.isArray(expectWorkExpList) &&
                          expectWorkExpList.length &&
                          [
                            MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                            MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                          ].includes(expectWorkExpNotMatchStrategy) &&
                          strategyScopeOptionWhenMarkJobWorkExpNotMatch === StrategyScopeOptionWhenMarkJobNotMatch.ALL_JOB
                        ) ? !expectWorkExpList.includes(it.jobExperience) : false
                      ) || (
                        // enter job detail to mark as not suit for salary filter
                        (
                          isSalaryFilterEnabled &&
                          [
                            MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                            MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                          ].includes(expectSalaryNotMatchStrategy) &&
                          strategyScopeOptionWhenMarkSalaryNotMatch === StrategyScopeOptionWhenMarkJobNotMatch.ALL_JOB
                        ) ? !checkIfSalarySuit(it.salaryDesc) : false
                      ) || (
                        // enter job detail to mark as not suit for company name filter
                        !!blockCompanyNameRegExp &&
                        blockCompanyNameRegExp.test(it.brandName?.toLowerCase?.() ?? '') &&
                          [
                            MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                            MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL
                          ].includes(blockCompanyNameRegMatchStrategy)
                      ) || (
                        // 全局黑名单检查（最高优先级，直接跳过）
                        isCompanyInGlobalBlockList(it.brandName)
                      )
                    )
                })
              }
              continueFind: while (targetJobIndex < 0 && !hasReachLastPage) {
                // when disable company allow list, we will believe that the first one in the list is your expect job.
                let tempTargetJobIndexToCheckDetail = getTempTargetJobIndexToCheckDetail()
                while (tempTargetJobIndexToCheckDetail < 0 && !hasReachLastPage) {
                  // fetch new
                  const recommendJobListElBBox = await recommendJobListElProxy.boundingBox()
                  const windowInnerHeight = await page.evaluate('window.innerHeight')
                  await page.mouse.move(
                    recommendJobListElBBox.x + recommendJobListElBBox.width / 2,
                    windowInnerHeight / 2
                  )
                  let scrolledHeight = 0
                  const increase = 40 + Math.floor(30 * Math.random())

                  while (
                    !requestNextPagePromiseWithResolver &&
                    !hasReachLastPage
                  ) {
                    scrolledHeight += increase
                    await page.mouse.wheel({deltaY: increase});
                    await sleep(100)
                    await requestNextPagePromiseWithResolver?.promise
                    hasReachLastPage = await page.evaluate(`
                      !(document.querySelector('.page-jobs-main')?.__vue__?.hasMore)
                    `)
                    if (hasReachLastPage) {
                      console.log(`Arrive the terminal of the job list.`)
                    }
                  }
                  requestNextPagePromiseWithResolver = null
                  await waitForSageTimeOrJustContinue({
                    tag: 'afterJobListPageFetched',
                    hooks
                  })
                  await sleep(5000)
                  await updateJobListData()
                  tempTargetJobIndexToCheckDetail = getTempTargetJobIndexToCheckDetail()
                }

                if (tempTargetJobIndexToCheckDetail < 0 && hasReachLastPage) {
                  // has reach last page and not find target job
                  reject(new Error('CANNOT_FIND_EXCEPT_JOB_IN_THIS_FILTER_CONDITION'))
                  return
                }

                //#region here to check detail
                if (tempTargetJobIndexToCheckDetail >= 0) {
                  // scroll that target element into view
                  await page.evaluate(`
                    targetEl = document.querySelector("ul.rec-job-list").children[${tempTargetJobIndexToCheckDetail}]
                    targetEl.scrollIntoView({
                      behavior: 'smooth',
                      block: ${Math.random() > 0.5 ? '\'center\'' : '\'end\''}
                    })
                  `)

                  await sleepWithRandomDelay(200)

                  if (tempTargetJobIndexToCheckDetail === 0) {
                  } else {
                    const recommendJobItemList = await recommendJobListElProxy.$$('ul.rec-job-list li.job-card-box')
                    const targetJobElProxy = recommendJobItemList[tempTargetJobIndexToCheckDetail]
                    // click that element
                    await sleep(500)
                    await targetJobElProxy.click()
                    await page.waitForResponse(
                      response => {
                        if (
                          response.url().startsWith('https://www.zhipin.com/wapi/zpgeek/job/detail.json')
                        ) {
                          return true
                        }
                        return false
                      }
                    );
                    await sleepWithRandomDelay(2000)
                  }
                  await waitForSageTimeOrJustContinue({
                    tag: 'afterJobDetailFetched',
                    hooks
                  })
                  targetJobData = await page.evaluate('document.querySelector(".job-detail-box").__vue__.data')
                  selectedJobData = await page.evaluate('document.querySelector(".page-jobs-main").__vue__.currentJob')
                  // save the job detail info
                  await hooks.jobDetailIsGetFromRecommendList?.promise(targetJobData)

                  //#region collect not suit reasons
                  const notSuitReasonIdToStrategyMap = {}
                  const notSuitConditionHandleMap = {
                    async companyName() {
                      blockJobNotSuit.add(targetJobData.jobInfo.encryptId)
                      if (blockCompanyNameRegMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL && !await page.$('.job-detail-box .job-detail-operate .not-suitable')) {
                        try {
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.COMPANY_NAME_NOT_SUIT,
                              extInfo: null,
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch {
                        }
                      }
                      else if (blockCompanyNameRegMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
                          await waitForSageTimeOrJustContinue({
                            tag: 'beforeJobNotSuitMarked',
                            hooks
                          })
                          const { chosenReasonInUi } = await markJobAsNotSuitInRecommendPage(MarkAsNotSuitReason.COMPANY_NAME_NOT_SUIT)
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.COMPANY_NAME_NOT_SUIT,
                              extInfo: {
                                chosenReasonInUi
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch(err) {
                          console.log(`mark boss inactive failed`, err)
                        }
                      }
                    },
                    async active() {
                      blockBossNotActive.add(targetJobData.jobInfo.encryptUserId)
                      if (jobNotActiveStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL || !await page.$('.job-detail-box .job-detail-operate .not-suitable')) {
                        try {
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.BOSS_INACTIVE,
                              extInfo: null,
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch {
                        }
                      }
                      else if (jobNotActiveStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
                          await waitForSageTimeOrJustContinue({
                            tag: 'beforeJobNotSuitMarked',
                            hooks
                          })
                          const { chosenReasonInUi } = await markJobAsNotSuitInRecommendPage(MarkAsNotSuitReason.BOSS_INACTIVE)
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.BOSS_INACTIVE,
                              extInfo: {
                                bossActiveTimeDesc: targetJobData.bossInfo.activeTimeDesc,
                                chosenReasonInUi
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch(err) {
                          console.log(`mark boss inactive failed`, err)
                        }
                      }
                    },
                    async city() {
                      blockJobNotSuit.add(targetJobData.jobInfo.encryptId)
                      if (expectCityNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL || !await page.$('.job-detail-box .job-detail-operate .not-suitable')) {
                        try {
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_CITY_NOT_SUIT,
                              extInfo: null,
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch {
                        }
                      }
                      else if (expectCityNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
                          await waitForSageTimeOrJustContinue({
                            tag: 'beforeJobNotSuitMarked',
                            hooks
                          })
                          const { chosenReasonInUi } = await markJobAsNotSuitInRecommendPage(MarkAsNotSuitReason.JOB_CITY_NOT_SUIT)
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_CITY_NOT_SUIT,
                              extInfo: {
                                chosenReasonInUi
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch(err) {
                          console.log(`mark job city not suit failed`, err)
                        }
                      }
                    },
                    async workExp() {
                      blockJobNotSuit.add(targetJobData.jobInfo.encryptId)
                      if (expectWorkExpNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL || !await page.$('.job-detail-box .job-detail-operate .not-suitable')) {
                        try {
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_WORK_EXP_NOT_SUIT,
                              extInfo: null,
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch {
                        }
                      }
                      else if (expectWorkExpNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
                          await waitForSageTimeOrJustContinue({
                            tag: 'beforeJobNotSuitMarked',
                            hooks
                          })
                          const { chosenReasonInUi } = await markJobAsNotSuitInRecommendPage(MarkAsNotSuitReason.JOB_WORK_EXP_NOT_SUIT)
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_WORK_EXP_NOT_SUIT,
                              extInfo: {
                                chosenReasonInUi
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch(err) {
                          console.log(`mark job work exp not suit failed`, err)
                        }
                      }
                    },
                    async jobDetail() {
                      blockJobNotSuit.add(targetJobData.jobInfo.encryptId)
                      if (jobNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL || !await page.$('.job-detail-box .job-detail-operate .not-suitable')) {
                        try {
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_NOT_SUIT,
                              extInfo: null,
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch {
                        }
                      }
                      else if (jobNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
                          await waitForSageTimeOrJustContinue({
                            tag: 'beforeJobNotSuitMarked',
                            hooks
                          })
                          const { chosenReasonInUi } = await markJobAsNotSuitInRecommendPage(MarkAsNotSuitReason.JOB_NOT_SUIT)
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_NOT_SUIT,
                              extInfo: {
                                bossActiveTimeDesc: targetJobData.bossInfo.activeTimeDesc,
                                chosenReasonInUi
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch(err) {
                          console.log(`mark job detail not suit failed`, err)
                        }
                      }
                    },
                    async salary() {
                      blockJobNotSuit.add(targetJobData.jobInfo.encryptId)
                      if (expectSalaryNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL || !await page.$('.job-detail-box .job-detail-operate .not-suitable')) {
                        try {
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_SALARY_NOT_SUIT,
                              extInfo: {
                                salaryDesc: selectedJobData.salaryDesc,
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch {
                        }
                      }
                      else if (expectSalaryNotMatchStrategy === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS) {
                        try {
                          await waitForSageTimeOrJustContinue({
                            tag: 'beforeJobNotSuitMarked',
                            hooks
                          })
                          const { chosenReasonInUi } = await markJobAsNotSuitInRecommendPage(MarkAsNotSuitReason.JOB_SALARY_NOT_SUIT)
                          await hooks.jobMarkedAsNotSuit.promise(
                            targetJobData,
                            {
                              markFrom: ChatStartupFrom.AutoFromRecommendList,
                              markReason: MarkAsNotSuitReason.JOB_SALARY_NOT_SUIT,
                              extInfo: {
                                salaryDesc: selectedJobData.salaryDesc,
                                chosenReasonInUi
                              },
                              markOp: MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS,
                              jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                            }
                          )
                        } catch(err) {
                          console.log(`mark job salary not suit failed`, err)
                        }
                      }
                    }
                  }

                  // 首先检查全局黑名单（最高优先级，直接跳过不沟通）
                  if (isCompanyInGlobalBlockList(selectedJobData.brandName)) {
                    console.log(`[GlobalBlockList] 公司 ${selectedJobData.brandName} 在全局黑名单中，跳过此职位`)
                    await hooks.jobSkipped.promise(
                      targetJobData,
                      {
                        skipReason: 'global_block_company',
                        companyName: selectedJobData.brandName,
                        jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
                      }
                    )
                    continue
                  }

                  if (
                    !!blockCompanyNameRegExp && blockCompanyNameRegExp.test(selectedJobData.brandName ?? '')
                  ) {
                    notSuitReasonIdToStrategyMap.companyName = blockCompanyNameRegMatchStrategy
                  }
                  //#region
                  // null
                  // 刚刚活跃 // 今日活跃 // 昨日活跃 // 3日内活跃 // 本周活跃 // 2周内活跃
                  // 本月活跃 // 2月内活跃 // 3月内活跃 // 4月内活跃 // 5月内活跃 // 近半年活跃 // 半年前活跃
                  //#endregion
                  const indexOfActiveText = activeDescList.indexOf(targetJobData.bossInfo.activeTimeDesc)
                  if (
                    markAsNotActiveSelectedTimeRange > 0 &&
                    indexOfActiveText > 0 && indexOfActiveText <= markAsNotActiveSelectedTimeRange
                  ) {
                    // click prevent recommend button
                    notSuitReasonIdToStrategyMap.active = jobNotActiveStrategy
                  }
                  if (
                    (Array.isArray(expectCityList) && expectCityList.length) && !checkCityMatch(selectedJobData.cityName, selectedJobData.areaDistrict, selectedJobData.businessDistrict, expectCityList)
                  ) {
                    notSuitReasonIdToStrategyMap.city = expectCityNotMatchStrategy
                  }
                  if (
                    (Array.isArray(expectWorkExpList) && expectWorkExpList.length) && !expectWorkExpList.includes(selectedJobData.jobExperience)
                  ) {
                    notSuitReasonIdToStrategyMap.workExp = expectWorkExpNotMatchStrategy
                  }
                  if (
                    !testIfJobTitleOrDescriptionSuit(targetJobData.jobInfo, jobDetailRegExpMatchLogic)
                  ) {
                    notSuitReasonIdToStrategyMap.jobDetail = jobNotMatchStrategy
                  }
                  if (
                    !checkIfSalarySuit(selectedJobData.salaryDesc)
                  ) {
                    notSuitReasonIdToStrategyMap.salary = expectSalaryNotMatchStrategy
                  }
                  // #endregion
                  console.log('not suit reason and related strategy: ', notSuitReasonIdToStrategyMap)

                  // #region execute mark logic
                  // 1. find the one mark on Boss
                  const markOnBossCondition = Object.keys(notSuitReasonIdToStrategyMap).find(k => notSuitReasonIdToStrategyMap[k] === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_BOSS)
                  if (markOnBossCondition) {
                    await notSuitConditionHandleMap[markOnBossCondition]()
                    continue continueFind
                  }
                  // 2. if there is no condition to mark Boss, then find the one mark on local db
                  const markOnLocalDbCondition = Object.keys(notSuitReasonIdToStrategyMap).find(k => notSuitReasonIdToStrategyMap[k] === MarkAsNotSuitOp.MARK_AS_NOT_SUIT_ON_LOCAL)
                  if (markOnLocalDbCondition) {
                    await notSuitConditionHandleMap[markOnLocalDbCondition]()
                    continue continueFind
                  }
                  // 3.
                  const noOpCondition = Object.keys(notSuitReasonIdToStrategyMap).find(k => notSuitReasonIdToStrategyMap[k] === MarkAsNotSuitOp.NO_OP)
                  if (noOpCondition) {
                    await notSuitConditionHandleMap[noOpCondition]()
                    continue continueFind
                  }
                  // #endregion
                  if (
                    // test company again - when allow list not include target company, just skip
                    enableCompanyAllowList && ![...expectCompanySet].find(
                      name => selectedJobData.brandName?.toLowerCase?.()?.includes(name.toLowerCase())
                    ) ||
                    // check if job has been marked as not suit or not active
                    [
                      ...blockJobNotSuit,
                      ...blockBossNotActive
                    ].includes(targetJobData.jobInfo.encryptId)
                  ) {
                    // just skip
                    continue continueFind
                  }
                  const startChatButtonInnerHTML = await page.evaluate('document.querySelector(".job-detail-box .op-btn.op-btn-chat")?.innerHTML.trim()')
                  if (startChatButtonInnerHTML !== '立即沟通') {
                    blockBossNotNewChat.add(targetJobData.jobInfo.encryptUserId)
                    continue continueFind
                  }
                  targetJobIndex = tempTargetJobIndexToCheckDetail
                  //#endregion
                }

                if (targetJobIndex < 0 && hasReachLastPage) {
                  // has reach last page and not find target job
                  reject(new Error('CANNOT_FIND_EXCEPT_JOB_IN_THIS_FILTER_CONDITION'))
                  return
                }
              }

              resolve(
                {
                  targetJobIndex,
                  targetJobData
                }
              )
            } catch(err) {
              reject(err)
            }
          })
          await waitForSageTimeOrJustContinue({
            tag: 'beforeJobChatStartup',
            hooks
          })
          await sleepWithRandomDelay(1000)
          const startChatButtonInnerHTML = await page.evaluate('document.querySelector(".job-detail-box .op-btn.op-btn-chat")?.innerHTML.trim()')

          await hooks.newChatWillStartup?.promise(targetJobData)
          
          // Check daily chat limit before starting new chat
          if (dailyRemainingChatCount === 0) {
            const msg = `[DailyLimit] 今日沟通次数已达上限 (${DAILY_CHAT_LIMIT}次)，停止自动聊天`
            hooks.logWarn?.(msg)
            console.warn(msg)
            throw new Error('STARTUP_CHAT_ERROR_DUE_TO_TODAY_CHANCE_HAS_USED_OUT')
          }
          if (dailyRemainingChatCount !== null && dailyRemainingChatCount <= 5) {
            const msg = `[DailyLimit] 警告：今日仅剩 ${dailyRemainingChatCount} 次沟通机会`
            hooks.logWarn?.(msg)
            console.warn(msg)
          }
          
          // 等待按钮可见且可点击
          await page.waitForSelector('.job-detail-box .op-btn.op-btn-chat', {
            visible: true,
            timeout: 5000
          })
          
          const startChatButtonProxy = await page.$('.job-detail-box .op-btn.op-btn-chat')
          if (!startChatButtonProxy) {
            throw new Error('STARTUP_CHAT_ERROR_WITH_UNKNOWN_ERROR: 无法找到立即沟通按钮')
          }
          
          await sleep(500)
          
          //#region click the chat button
          try {
            await startChatButtonProxy.click()
          } catch (clickErr) {
            console.log('[Click] 常规点击失败，尝试使用 JavaScript 点击:', clickErr.message)
            await page.evaluate(() => {
              const btn = document.querySelector('.job-detail-box .op-btn.op-btn-chat')
              if (btn) {
                btn.click()
              }
            })
          }
          
          hooks.logInfo?.('[Chat] 已点击立即沟通按钮，等待响应...')

          const waitAddFriendResponse = async () => {
            hooks.logInfo?.('[Chat] 等待打招呼响应...')
            let responseReceived = false
            let addFriendResponse
            let retryCount = 0
            const maxRetries = 3
            
            // 循环等待，直到获取非 preflight 请求的有效响应
            while (true) {
              addFriendResponse = await page.waitForResponse(
                response => {
                  const url = response.url()
                  if (url.startsWith('https://www.zhipin.com/wapi/zpgeek/friend/add.json')) {
                    // 排除 preflight 请求 (OPTIONS 方法没有响应体)
                    if (response.request().method() === 'OPTIONS') {
                      hooks.logInfo?.(`[Chat] 跳过 preflight 请求: ${url.substring(0, 80)}...`)
                      return false
                    }
                    hooks.logInfo?.(`[Chat] 收到 add.json 响应: ${url.substring(0, 100)}...`)
                    if (url.includes(`jobId=${targetJobData.jobInfo.encryptId}`)) {
                      responseReceived = true
                      return true
                    }
                  }
                  return false
                },
                { timeout: 10000 }
              );
              
              // 如果是 preflight 请求，继续等待下一个响应
              if (addFriendResponse.request().method() === 'OPTIONS') {
                hooks.logInfo?.('[Chat] 检测到 preflight 请求，继续等待实际响应...')
                continue
              }
              
              break
            }
            
            hooks.logInfo?.(`[Chat] 响应状态: ${addFriendResponse.status()}, 请求方法: ${addFriendResponse.request().method()}`)
            
            // 尝试读取响应体
            try {
              const responseText = await addFriendResponse.text()
              hooks.logInfo?.(`[Chat] 响应文本长度: ${responseText?.length ?? 0}`)
              
              if (!responseText || responseText.trim() === '') {
                throw new Error('响应体为空')
              }
              
              const res = JSON.parse(responseText)
              hooks.logInfo?.(`[Chat] 响应数据: code=${res.code}, message=${res.message || '无'}`)
              return res
            } catch (parseErr) {
              console.warn('[Chat] 读取响应失败:', parseErr.message)
              hooks.logError?.(`[Chat] 读取响应失败: ${parseErr.message}`)
              
              // 如果无法读取响应，等待一下让页面状态更新，然后检查是否有聊天对话框
              // 这通常意味着请求实际成功了，只是 Puppeteer 无法读取响应体
              hooks.logInfo?.('[Chat] 响应读取失败，等待页面状态更新...')
              await sleep(2000)
              
              // 检查是否进入了聊天页面（有聊天输入框）
              const hasChatInput = await page.$('.chat-conversation .message-controls .chat-input')
              if (hasChatInput) {
                hooks.logInfo?.('[Chat] 检测到聊天输入框，假设打招呼成功')
                // 返回一个模拟的成功响应
                return {
                  code: 0,
                  message: 'OK (assumed from page state)',
                  zpData: {
                    bizCode: 0
                  }
                }
              }
              
              // 检查是否有错误弹窗
              const errorDialog = await page.$('.greet-boss-dialog, .chat-block-dialog, .el-message-box')
              if (errorDialog) {
                hooks.logInfo?.('[Chat] 检测到弹窗，可能需要处理')
                // 尝试获取弹窗内容
                const dialogText = await page.evaluate(() => {
                  const dialogs = document.querySelectorAll('.greet-boss-dialog, .chat-block-dialog, .el-message-box')
                  for (const d of dialogs) {
                    if (d.offsetParent !== null) return d.textContent
                  }
                  return null
                })
                hooks.logInfo?.(`[Chat] 弹窗内容: ${dialogText?.substring(0, 100) || '无法获取'}`)
              }
              
              // 如果检测到聊天输入框，说明已经进入聊天页面，不抛出错误
              const hasChatInputCheck = await page.$('.chat-conversation .message-controls .chat-input')
              if (hasChatInputCheck) {
                hooks.logInfo?.('[Chat] 响应读取失败但检测到聊天输入框，继续执行')
                return {
                  code: 0,
                  message: 'OK (assumed from page state after error)',
                  zpData: {
                    bizCode: 0
                  }
                }
              }
              
              throw new Error('STARTUP_CHAT_ERROR_WITH_UNKNOWN_ERROR')
            }
          }
          const waitAndHandleChatSuccess = async () => {
            await hooks.newChatStartup?.promise(
              targetJobData,
              {
                chatStartupFrom: ChatStartupFrom.AutoFromRecommendList,
                jobSource: JobSource[computedSourceList[currentSourceIndex]?.type]
              }
            )
            blockBossNotNewChat.add(targetJobData.jobInfo.encryptUserId)

            await storeStorage(page).catch(() => void 0)
            await sleepWithRandomDelay(1500)
            const closeDialogButtonProxy = await page.$('.greet-boss-dialog .greet-boss-footer .cancel-btn')
            if (closeDialogButtonProxy) {
              await closeDialogButtonProxy.click()
              await sleepWithRandomDelay(2000)
            } else {
              hooks.logInfo?.('[Chat] 未找到问候对话框，跳过关闭步骤')
            }
            
            // 根据模式发送打招呼消息
            let messageToSend = null
            
            hooks.logInfo?.(`[Chat] 当前打招呼模式: ${greetingMessageConfig.mode} (0=默认, 1=自定义, 2=AI生成)`)
            
            switch (greetingMessageConfig.mode) {
              case GreetingMessageMode.CUSTOM:
                // 使用固定自定义消息
                messageToSend = greetingMessageConfig.customMessage?.trim() || null
                hooks.logInfo?.(`[Chat] 自定义模式: 消息长度=${greetingMessageConfig.customMessage?.length ?? 0}, 有效=${!!messageToSend}`)
                if (messageToSend) {
                  hooks.logInfo?.('[Chat] 准备发送固定自定义打招呼消息...')
                }
                break
                
              case GreetingMessageMode.AI_GENERATED:
                // 使用 AI 根据 JD 和简历生成消息
                hooks.logInfo?.('[Chat] 准备使用 AI 生成打招呼消息...')
                messageToSend = await generateGreetingMessageWithAI(targetJobData, null)
                if (messageToSend) {
                  hooks.logInfo?.('[Chat] AI 生成消息成功')
                } else {
                  hooks.logInfo?.('[Chat] AI 生成消息失败，跳过发送')
                }
                break
                
              case GreetingMessageMode.DEFAULT:
              default:
                // 使用 BOSS 默认问候语，不发送自定义消息
                hooks.logInfo?.('[Chat] 使用 BOSS 默认问候语，不发送自定义消息')
                break
            }
            
            // 发送消息
            if (messageToSend) {
              try {
                hooks.logInfo?.('[Chat] 开始发送自定义消息...')
                const chatInputSelector = '.chat-conversation .message-controls .chat-input'
                const chatInputHandle = await page.$(chatInputSelector)
                hooks.logInfo?.(`[Chat] 输入框元素: ${chatInputHandle ? '找到' : '未找到'}`)
                if (chatInputHandle) {
                  await chatInputHandle.click()
                  await sleep(500)
                  await chatInputHandle.type(messageToSend, { delay: 50 })
                  await sleep(1000)
                  const sendButtonSelector = '.chat-conversation .message-controls .chat-op .btn-send:not(.disabled)'
                  const sendButton = await page.$(sendButtonSelector)
                  hooks.logInfo?.(`[Chat] 发送按钮: ${sendButton ? '找到' : '未找到'}`)
                  if (sendButton) {
                    await sendButton.click()
                    hooks.logInfo?.('[Chat] 打招呼消息已发送')
                  }
                }
              } catch (sendErr) {
                console.warn('发送打招呼消息失败:', sendErr.message)
                hooks.logError?.(`[Chat] 发送打招呼消息失败: ${sendErr.message}`)
              }
            } else {
              hooks.logInfo?.('[Chat] 没有要发送的消息 (messageToSend 为空)')
            }
          }
          const handleAddFriendResponse = async (res) => {
            // Parse remaining chat count from response
            const chatRemindContent = res.zpData?.bizData?.chatRemindDialog?.content
            if (chatRemindContent) {
              const match = chatRemindContent.match(/剩(\d+)次沟通机会/)
              if (match) {
                dailyRemainingChatCount = parseInt(match[1], 10)
                hooks.logInfo?.(`[DailyLimit] 今日剩余沟通次数: ${dailyRemainingChatCount}`)
                console.log(`[DailyLimit] 今日剩余沟通次数: ${dailyRemainingChatCount}`)
              }
            }
            
            if (res.code === 0) {
              // Success: decrement remaining count if known
              if (dailyRemainingChatCount !== null && dailyRemainingChatCount > 0) {
                dailyRemainingChatCount--
                hooks.logInfo?.(`[DailyLimit] 沟通成功，剩余次数更新为: ${dailyRemainingChatCount}`)
              }
              await waitAndHandleChatSuccess()
            }
            else if (
              res.zpData.bizCode === 1 &&
              res.zpData.bizData?.chatRemindDialog?.blockLevel === 0 &&
              /剩\d+次沟通机会/.test(res.zpData.bizData?.chatRemindDialog?.content)
            ) {
              await waitForSageTimeOrJustContinue({
                tag: 'beforeJobChatStartupAfterTwiceConfirm',
                hooks
              })
              const confirmButton = await page.waitForSelector('.chat-block-dialog .chat-block-footer .sure-btn')
              await confirmButton.click()
              const nextRes = await waitAddFriendResponse()
              await handleAddFriendResponse(nextRes)
            }
            else if (
              res.zpData.bizCode === 1 &&
              /猎头/.test(res.zpData.bizData?.chatRemindDialog?.content)
            ) {
              await waitForSageTimeOrJustContinue({
                tag: 'beforeJobChatStartupAfterTwiceConfirm',
                hooks
              })
              const confirmButton = await page.waitForSelector(`xpath///*[contains(@class, "chat-block-dialog")]//*[contains(@class, "chat-block-footer")]//*[contains(text(), "继续")]`)
              await confirmButton.click()
              const nextRes = await waitAddFriendResponse()
              await handleAddFriendResponse(nextRes)
            }
            else if (
              res.zpData.bizCode === 1 &&
              res.zpData.bizData?.chatRemindDialog?.blockLevel === 0 && 
              (
                res.zpData.bizData?.chatRemindDialog?.content === `今日沟通人数已达上限，请明天再试` ||
                /明天再来/.test(res.zpData.bizData?.chatRemindDialog?.content)
              )
            ) {
              // startup chat error, may the chance of today has used out
              await storeStorage(page).catch(() => void 0)
              throw new Error('STARTUP_CHAT_ERROR_DUE_TO_TODAY_CHANCE_HAS_USED_OUT')
            }
            else {
              console.error(
                '打招呼接口返回未知错误格式:'
              )
              console.error(
                JSON.stringify(res, null, 2)
              )
              throw new Error('STARTUP_CHAT_ERROR_WITH_UNKNOWN_ERROR')
            }
          }
          const res = await waitAddFriendResponse()
          await handleAddFriendResponse(res)
          // #endregion
        } catch (err) {
          if (err instanceof Error) {
            switch (err.message) {
              case 'CANNOT_FIND_EXCEPT_JOB_IN_THIS_FILTER_CONDITION': {
                await sleepWithRandomDelay(25 * 1000)
                continue iterateFilterCondition;
              }
              case 'STARTUP_CHAT_ERROR_DUE_TO_TODAY_CHANCE_HAS_USED_OUT': {
                let nextTrySeconds = 60 * 60
                const msg = `今日沟通次数已达上限（${DAILY_CHAT_LIMIT}次/天）。已停止自动聊天，将在 ${Math.round(nextTrySeconds/60)} 分钟后重试。`
                hooks.errorEncounter?.call(msg)
                console.error(msg)
                await sleep(nextTrySeconds * 1000)
                throw err
              }
              case 'STARTUP_CHAT_ERROR_WITH_UNKNOWN_ERROR': {
                hooks.errorEncounter?.call([err.message, err.stack].join('\n'))
                throw err
              }
              default: {
                hooks.errorEncounter?.call([err.message, err.stack].join('\n'))
                throw err
              }
            }
          } else {
            hooks.errorEncounter?.call(err)
            throw err
          }
        }
      }
    }
    // for of reach terminal
    if (
      currentSourceIndex + 1 >= computedSourceList.length
    ) {
      hooks.noPositionFoundForCurrentJob?.call()
      hooks.noPositionFoundAfterTraverseAllJob?.call()
      await sleep((20 + 30 * Math.random()) * 1000)
      await Promise.all([
        page.goto(`https://www.zhipin.com/web/geek/jobs`),
        page.waitForNavigation()
      ])
      currentSourceIndex = 0
    } else {
      hooks.noPositionFoundForCurrentJob?.call()
      await sleep((10 + 15 * Math.random()) * 1000)
      currentSourceIndex += 1
    }
  }
}

export async function mainLoop (hooks) {
  console.log('[DEBUG] mainLoop started')
  // Reset daily chat count at the start of each session (new day assumed)
  dailyRemainingChatCount = null
  hooks.logInfo?.('[DailyLimit] 每日沟通次数限制已重置（新会话开始）')
  console.log('[DailyLimit] 每日沟通次数限制已重置（新会话开始）')
  
  if (!puppeteer) {
    console.log('[DEBUG] Puppeteer not initialized, calling initPuppeteer...')
    await initPuppeteer()
    console.log('[DEBUG] initPuppeteer done')
  }
  try {
    // 从环境变量读取无头模式配置
    const headlessMode = process.env.DAGEGONG_BROWSER_HEADLESS === '1'
    console.log('[DEBUG] Headless mode:', headlessMode)
    if (headlessMode) {
      console.log('[Browser] 以无头模式启动浏览器')
    }
    
    console.log('[DEBUG] Launching browser with executable path:', process.env.PUPPETEER_EXECUTABLE_PATH)
    browser = await puppeteer.launch({
      headless: headlessMode ? 'new' : false,
      ignoreHTTPSErrors: true,
      ignoreDefaultArgs: ['--enable-automation'],
      defaultViewport: headlessMode ? null : {
        width: 1440,
        height: 900 - 140,
      },
      args: [
        '--disable-infobars',
        '--window-size=1440,900',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process,AutomationControlled',
        '--test-type=ui',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-site-isolation-trials',
        '--disable-web-security',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--hide-scrollbars',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-features=TranslateUI',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--force-color-profile=srgb',
        '--metrics-recording-only',
        '--safebrowsing-disable-auto-update',
        '--password-store=basic',
        '--use-mock-keychain',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    })
    console.log('[DEBUG] Browser launched successfully')
    hooks.puppeteerLaunched?.call(browser)
    page = (await browser.pages())[0]
    console.log('[DEBUG] Got first page')
    hooks.pageGotten?.call(page)
    
    // 监听浏览器断开连接
    browser.on('disconnected', () => {
      console.error('[Browser] 浏览器进程已断开连接')
      hooks.logError?.('[Browser] 浏览器进程已断开连接（可能已崩溃）')
    })
    
    // 监听页面崩溃
    page.on('error', (err) => {
      console.error('[Page] 页面错误:', err.message)
      hooks.logError?.(`[Page] 页面错误: ${err.message}`)
    })
    
    //set cookies
    const bossCookies = readStorageFile('boss-cookies.json')
    const bossLocalStorage = readStorageFile('boss-local-storage.json')
    await hooks.cookieWillSet?.promise(bossCookies)
    for(let i = 0; i < bossCookies.length; i++){
      await page.setCookie(bossCookies[i]);
    }
    await setDomainLocalStorage(browser, localStoragePageUrl, bossLocalStorage)
    await page.bringToFront()
    // __GGR_INJECT_ANTI_ANTI_DEBUGGER__
    await hooks.mainFlowWillLaunch?.promise({
      jobNotMatchStrategy,
      jobNotActiveStrategy,
      expectCityNotMatchStrategy,
      blockJobNotSuit,
      blockBossNotActive,
      blockBossNotNewChat
    })
    await toRecommendPage(hooks)
    // goto search

    // ;await browser.close()
  } catch (err) {
    closeBrowserWindow()
    throw err
  }
}

export async function closeBrowserWindow () {
  browser?.close()
  const browserProcess = browser?.process()
  if (browserProcess) {
    try {
      process.kill(browserProcess.pid)
    }
    catch {}
  }
  browser = null
  page = null
}

async function storeStorage (page) {
  const [
    cookies, localStorage
  ] = await Promise.all([
    page.cookies(),
    page.evaluate(() => {
      return JSON.stringify(window.localStorage)
    }).then(res => JSON.parse(res))
  ])
  return Promise.all(
    [
      writeStorageFile('boss-cookies.json', cookies),
      writeStorageFile('boss-local-storage.json', localStorage),
    ]
  )
}
