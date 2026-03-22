/**
 * 自动发送简历模块
 * 当 BOSS 在聊天中索要简历时，自动发送简历给对方
 */

import { readConfigFile } from './runtime-file-utils.mjs'
import { sleep } from '@dagegong/utils/sleep.mjs'

// 聊天好友列表 API
const GEEK_FRIEND_LIST_API = 'https://www.zhipin.com/wapi/zprelation/friend/getGeekFriendList'
// 按标签筛选好友 API
const GEEK_FILTER_BY_LABEL_API = 'https://www.zhipin.com/wapi/zprelation/friend/geekFilterByLabel'
// 历史消息 API
const HISTORY_MSG_API = 'https://www.zhipin.com/wapi/zpchat/geek/historyMsg'
// 简历列表 API
const RESUME_LIST_API = 'https://www.zhipin.com/wapi/zpgeek/resume/attachment/checkbox.json'
// 发送简历 API
const EXCHANGE_RESUME_API = 'https://www.zhipin.com/wapi/zpchat/exchange/request'

// 轮询间隔（毫秒）
const POLL_INTERVAL_MS = 30 * 1000 // 30 秒

// 消息关键词（BOSS 要简历时会说的关键词）
const RESUME_KEYWORDS = ['简历', '发一下', '发份', '附件简历', '发简历', '简历发', 'cv', '发你简历']

/**
 * 判断消息是否需要发送简历
 * @param {string} message
 * @returns {boolean}
 */
function isAskForResume(message) {
  if (!message) return false
  const lowerMsg = message.toLowerCase()
  return RESUME_KEYWORDS.some(keyword => lowerMsg.includes(keyword))
}

/**
 * 格式化 API 响应日志
 * @param {string} apiName - API 名称
 * @param {Object} response - 响应对象
 */
function logApiResponse(apiName, response) {
  const hasData = response.zpData !== undefined
  const dataKeys = hasData ? Object.keys(response.zpData || {}) : []
  const listKeys = dataKeys.filter(k => Array.isArray(response.zpData?.[k]))
  
  console.log(`[AutoSendResume] [API响应] ${apiName}:`, {
    code: response.code,
    message: response.message || response.msg || '无',
    hasData: hasData,
    dataKeys: dataKeys,
    listFields: listKeys.map(k => `${k}[${response.zpData[k]?.length || 0}]`)
  })
}

/**
 * 获取聊天好友列表
 * @param {import('puppeteer').Page} page
 * @returns {Promise<Array<any>>}
 */
async function getChatFriendList(page) {
  try {
    const url = `${GEEK_FRIEND_LIST_API}?page=1&pageSize=100`
    console.log(`[AutoSendResume] [API请求] GET ${url}`)
    
    const startTime = Date.now()
    const response = await page.evaluate(async (apiUrl) => {
      const params = new URLSearchParams({
        page: '1',
        pageSize: '100'
      })
      
      const res = await fetch(`${apiUrl}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'accept': 'application/json, text/plain, */*',
          'x-requested-with': 'XMLHttpRequest'
        },
        credentials: 'include'
      })
      return res.json()
    }, GEEK_FRIEND_LIST_API)
    
    const duration = Date.now() - startTime
    logApiResponse('getGeekFriendList', response)
    console.log(`[AutoSendResume] [API耗时] getGeekFriendList: ${duration}ms`)

    if (response.code !== 0) {
      console.log('[AutoSendResume] [API错误] 获取聊天好友列表失败:', response.message || response.msg)
      return []
    }

    const friendList = response.zpData?.friendList || response.zpData?.list || []
    console.log(`[AutoSendResume] 获取到 ${friendList.length} 个聊天好友`)
    
    // 打印前3个好友的摘要信息
    if (friendList.length > 0) {
      console.log('[AutoSendResume] [好友列表摘要] 前3个:')
      friendList.slice(0, 3).forEach((f, i) => {
        console.log(`  [${i + 1}] ${f.name || '未知'} | ${f.brandName || '未知公司'} | lastText: ${(f.lastText || '').substring(0, 30)}...`)
      })
    }
    
    return friendList
  } catch (err) {
    console.error('[AutoSendResume] [API异常] 获取聊天好友列表出错:', err.message)
    console.error('[AutoSendResume] [错误详情]', err.stack)
    return []
  }
}

/**
 * 按标签筛选获取好友列表
 * @param {import('puppeteer').Page} page
 * @param {number} labelId
 * @param {string} name
 * @returns {Promise<Array<any>>}
 */
async function getFriendListByLabel(page, labelId = 0, name = '全部') {
  try {
    const url = `${GEEK_FILTER_BY_LABEL_API}?labelId=${labelId}&name=${encodeURIComponent(name)}&page=1&pageSize=100`
    console.log(`[AutoSendResume] [API请求] GET ${url}`)
    
    const startTime = Date.now()
    const response = await page.evaluate(async (apiUrl, labelId, name) => {
      const params = new URLSearchParams({
        labelId: String(labelId),
        name: name,
        page: '1',
        pageSize: '100'
      })
      
      const res = await fetch(`${apiUrl}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'accept': 'application/json, text/plain, */*',
          'x-requested-with': 'XMLHttpRequest'
        },
        credentials: 'include'
      })
      return res.json()
    }, GEEK_FILTER_BY_LABEL_API, labelId, name)
    
    const duration = Date.now() - startTime
    logApiResponse('geekFilterByLabel', response)
    console.log(`[AutoSendResume] [API耗时] geekFilterByLabel: ${duration}ms`)

    if (response.code !== 0) {
      console.log('[AutoSendResume] [API错误] 按标签筛选好友列表失败:', response.message || response.msg)
      return []
    }

    const friendList = response.zpData?.friendList || response.zpData?.list || []
    console.log(`[AutoSendResume] 按标签筛选获取到 ${friendList.length} 个好友`)
    return friendList
  } catch (err) {
    console.error('[AutoSendResume] [API异常] 按标签筛选获取好友列表出错:', err.message)
    console.error('[AutoSendResume] [错误详情]', err.stack)
    return []
  }
}

/**
 * 获取聊天记录
 * @param {import('puppeteer').Page} page
 * @param {string} encryptBossId
 * @param {string} encryptJobId
 * @param {string} securityId
 * @returns {Promise<Array<any>>}
 */
async function getChatHistory(page, encryptBossId, encryptJobId, securityId) {
  try {
    const params = new URLSearchParams({
      bossId: encryptBossId,
      maxMsgId: '0',
      c: '20',
      page: '1',
      src: '0'
    })
    if (encryptJobId) {
      params.append('jobId', encryptJobId)
    }
    if (securityId) {
      params.append('securityId', securityId)
    }
    
    const url = `${HISTORY_MSG_API}?${params.toString()}`
    console.log(`[AutoSendResume] [API请求] GET historyMsg bossId=${encryptBossId.substring(0, 20)}...`)
    console.log(`[AutoSendResume] [请求参数] jobId=${encryptJobId ? '有' : '无'}, securityId=${securityId ? '有' : '无'}`)
    
    const startTime = Date.now()
    const response = await page.evaluate(async (apiUrl, bossId, jobId, secId) => {
      const params = new URLSearchParams({
        bossId: bossId,
        maxMsgId: '0',
        c: '20',
        page: '1',
        src: '0'
      })
      if (jobId) {
        params.append('jobId', jobId)
      }
      if (secId) {
        params.append('securityId', secId)
      }
      
      const res = await fetch(`${apiUrl}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'accept': 'application/json, text/plain, */*',
          'x-requested-with': 'XMLHttpRequest'
        },
        credentials: 'include'
      })
      return res.json()
    }, HISTORY_MSG_API, encryptBossId, encryptJobId, securityId)
    
    const duration = Date.now() - startTime
    
    // 详细记录响应
    console.log(`[AutoSendResume] [API响应] historyMsg:`, {
      code: response.code,
      message: response.message || '无',
      hasMore: response.zpData?.hasMore,
      messageCount: response.zpData?.messages?.length || 0,
      duration: `${duration}ms`
    })

    if (response.code !== 0) {
      console.log('[AutoSendResume] [API错误] 获取聊天记录失败:', response.message || response.msg)
      return []
    }

    const messages = response.zpData?.messages || []
    
    // 打印消息摘要
    if (messages.length > 0) {
      console.log('[AutoSendResume] [聊天记录摘要] 最近5条:')
      messages.slice(-5).forEach((msg, i) => {
        const fromName = msg.from?.name || '未知'
        const msgType = msg.body?.type || msg.type || '未知'
        let content = ''
        if (msg.body?.type === 1) {
          content = msg.body?.text || ''
        } else if (msg.pushText) {
          content = msg.pushText
        } else {
          content = `[类型${msgType}]`
        }
        console.log(`  [${i + 1}] ${fromName}: ${content.substring(0, 40)}${content.length > 40 ? '...' : ''}`)
      })
    }
    
    return messages
  } catch (err) {
    console.error('[AutoSendResume] [API异常] 获取聊天记录出错:', err.message)
    console.error('[AutoSendResume] [错误详情]', err.stack)
    return []
  }
}

/**
 * 分析聊天记录，检查是否需要发送简历
 * @param {Array} messages - 聊天记录
 * @param {string} currentUserId - 当前用户ID
 * @returns {Object|null}
 */
function analyzeChatForResumeRequest(messages, currentUserId) {
  if (!messages || messages.length === 0) {
    console.log('[AutoSendResume] [分析] 消息为空，跳过分析')
    return null
  }

  console.log(`[AutoSendResume] [分析] 开始分析 ${messages.length} 条消息, 当前用户ID: ${currentUserId}`)

  // 按时间排序
  const sortedMessages = [...messages].sort((a, b) => (a.time || 0) - (b.time || 0))
  
  // 从最新的消息开始往前检查
  for (let i = sortedMessages.length - 1; i >= 0; i--) {
    const msg = sortedMessages[i]
    const fromUid = String(msg.from?.uid || '')
    const isFromBoss = fromUid !== currentUserId
    
    // 获取消息文本内容
    let messageText = ''
    if (msg.body?.type === 1) {
      messageText = msg.body?.text || ''
    } else if (msg.pushText) {
      messageText = msg.pushText
    }
    
    // 打印正在检查的消息
    if (i >= sortedMessages.length - 3) {
      console.log(`[AutoSendResume] [分析] 检查消息[${i}] ${msg.from?.name || '未知'}: ${messageText.substring(0, 30)}... (isFromBoss: ${isFromBoss})`)
    }
    
    // 如果是 BOSS 发送的消息，且包含索要简历的关键词
    if (isFromBoss && isAskForResume(messageText)) {
      console.log(`[AutoSendResume] [分析] ✓ 发现 BOSS 索要简历的消息: "${messageText}"`)
      
      // 检查这条消息之后是否有发送过简历
      let hasSentResumeAfter = false
      let skipReason = ''
      
      for (let j = i + 1; j < sortedMessages.length; j++) {
        const laterMsg = sortedMessages[j]
        const laterFromUid = String(laterMsg.from?.uid || '')
        const isFromSelf = laterFromUid === currentUserId
        
        if (isFromSelf) {
          const laterType = laterMsg.body?.type
          const laterText = laterMsg.body?.text || ''
          
          // 如果自己有发送过简历
          if (laterType === 4 || laterType === 12) {
            hasSentResumeAfter = true
            skipReason = `已发送过简历 (type=${laterType}, mid=${laterMsg.mid})`
            break
          }
          
          // 如果自己回复了文本消息，且不是简历相关
          if (laterType === 1 && laterText) {
            const replyText = laterText.toLowerCase()
            if (replyText.includes('简历') || replyText.includes('已发') || replyText.includes('发了')) {
              hasSentResumeAfter = true
              skipReason = `已回复简历相关内容: "${laterText}"`
              break
            }
          }
        }
      }
      
      if (hasSentResumeAfter) {
        console.log(`[AutoSendResume] [分析] ✗ 跳过 - ${skipReason}`)
        continue
      }
      
      console.log(`[AutoSendResume] [分析] ✓ 确认需要发送简历`)
      return {
        messageId: msg.mid,
        messageText: messageText,
        time: msg.time
      }
    }
  }
  
  console.log('[AutoSendResume] [分析] 未发现需要发送简历的请求')
  return null
}

/**
 * 获取需要发送简历的聊天列表
 * @param {import('puppeteer').Page} page
 * @param {Object} options
 * @param {string} currentUserId - 当前用户ID
 * @returns {Promise<Array>}
 */
async function getPendingResumeRequests(page, options = {}, currentUserId) {
  console.log('[AutoSendResume] [流程] 开始获取待处理的简历请求...')
  
  const { useLabelFilter = false, labelId = 0, labelName = '全部' } = options
  
  // 1. 获取好友列表
  console.log(`[AutoSendResume] [流程] 步骤1: 获取好友列表 (useLabelFilter=${useLabelFilter})`)
  let friendList = []
  if (useLabelFilter) {
    friendList = await getFriendListByLabel(page, labelId, labelName)
  } else {
    friendList = await getChatFriendList(page)
  }
  
  if (friendList.length === 0) {
    console.log('[AutoSendResume] [流程] 好友列表为空，结束')
    return []
  }

  console.log(`[AutoSendResume] [流程] 步骤2: 逐个检查 ${friendList.length} 个聊天的详细记录`)
  
  const pendingList = []
  let checkedCount = 0
  let skippedCount = 0
  
  // 2. 逐个检查聊天记录
  for (const friend of friendList) {
    const encryptBossId = friend.encryptFriendId || friend.encryptBossId || friend.bossId
    const encryptJobId = friend.encryptJobId || friend.jobId
    const securityId = friend.securityId
    const friendName = friend.name || '未知'
    
    if (!encryptBossId) {
      console.log(`[AutoSendResume] [流程] 跳过 ${friendName} - 缺少 bossId`)
      continue
    }
    
    // 快速预检
    const lastMsg = friend.lastText || friend.lastMsg || ''
    if (!isAskForResume(lastMsg) && friend.lastIsSelf) {
      skippedCount++
      continue
    }
    
    checkedCount++
    console.log(`\n[AutoSendResume] [流程] [${checkedCount}] 检查: ${friendName} (${friend.brandName || '未知公司'})`)
    console.log(`[AutoSendResume] [流程]     lastText: ${lastMsg.substring(0, 40)}${lastMsg.length > 40 ? '...' : ''}`)
    
    // 获取详细聊天记录
    const messages = await getChatHistory(page, encryptBossId, encryptJobId, securityId)
    
    if (messages.length === 0) {
      console.log(`[AutoSendResume] [流程]     未获取到聊天记录，跳过`)
      continue
    }
    
    // 分析聊天记录
    const resumeRequest = analyzeChatForResumeRequest(messages, currentUserId)
    
    if (resumeRequest) {
      console.log(`[AutoSendResume] [流程]     ✓ 发现简历请求!`)
      pendingList.push({
        securityId: securityId,
        encryptBossId: encryptBossId,
        encryptJobId: encryptJobId,
        name: friendName,
        company: friend.brandName || friend.brandComInfo?.brandName || '',
        jobName: friend.jobName || '',
        requestMessage: resumeRequest.messageText,
        requestTime: resumeRequest.time,
        uniqueId: `${encryptBossId}_${encryptJobId || 'no-job'}_${resumeRequest.messageId}`
      })
    } else {
      console.log(`[AutoSendResume] [流程]     ✗ 无需发送简历`)
    }
    
    // 添加短暂延迟
    await sleep(500)
  }
  
  console.log(`\n[AutoSendResume] [流程] 检查完成: 总计${friendList.length}个, 快速跳过${skippedCount}个, 详细检查${checkedCount}个, 发现${pendingList.length}个请求`)
  return pendingList
}

/**
 * 获取简历列表
 * @param {import('puppeteer').Page} page
 * @returns {Promise<Array>}
 */
async function getResumeList(page) {
  try {
    console.log(`[AutoSendResume] [API请求] GET ${RESUME_LIST_API}`)
    
    const startTime = Date.now()
    const response = await page.evaluate(async (apiUrl) => {
      const res = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'accept': 'application/json, text/plain, */*',
          'x-requested-with': 'XMLHttpRequest'
        },
        credentials: 'include'
      })
      return res.json()
    }, RESUME_LIST_API)
    
    const duration = Date.now() - startTime
    logApiResponse('checkbox', response)
    console.log(`[AutoSendResume] [API耗时] checkbox: ${duration}ms`)

    if (response.code !== 0) {
      console.log('[AutoSendResume] [API错误] 获取简历列表失败:', response.message)
      return []
    }

    const list = response.zpData?.resumeList || []
    console.log(`[AutoSendResume] 获取到 ${list.length} 份简历`)
    
    if (list.length > 0) {
      console.log('[AutoSendResume] [简历列表]:')
      list.forEach((r, i) => {
        console.log(`  [${i + 1}] ${r.showName || '未命名'}.${r.suffixName || ''} (ID: ${r.resumeId?.substring(0, 20)}...)`)
      })
    }
    
    return list.map(item => ({
      resumeId: item.resumeId,
      showName: item.showName,
      suffixName: item.suffixName
    }))
  } catch (err) {
    console.error('[AutoSendResume] [API异常] 获取简历列表出错:', err.message)
    console.error('[AutoSendResume] [错误详情]', err.stack)
    return []
  }
}

/**
 * 发送简历给 BOSS
 * @param {import('puppeteer').Page} page
 * @param {string} securityId
 * @param {string} encryptResumeId
 * @returns {Promise<boolean>}
 */
async function sendResumeToBoss(page, securityId, encryptResumeId) {
  try {
    console.log(`[AutoSendResume] [API请求] POST ${EXCHANGE_RESUME_API}`)
    console.log(`[AutoSendResume] [请求参数] type=3, securityId=${securityId?.substring(0, 20)}..., resumeId=${encryptResumeId?.substring(0, 20)}...`)
    
    const startTime = Date.now()
    const response = await page.evaluate(async (apiUrl, secId, resumeId) => {
      const params = new URLSearchParams({
        securityId: secId,
        type: '3',
        encryptResumeId: resumeId,
        mid: ''
      })
      
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'accept': 'application/json, text/plain, */*',
          'content-type': 'application/x-www-form-urlencoded',
          'x-requested-with': 'XMLHttpRequest'
        },
        credentials: 'include',
        body: params.toString()
      })
      return res.json()
    }, EXCHANGE_RESUME_API, securityId, encryptResumeId)
    
    const duration = Date.now() - startTime
    
    console.log(`[AutoSendResume] [API响应] exchange/request:`, {
      code: response.code,
      message: response.message || '无',
      duration: `${duration}ms`
    })

    if (response.code === 0) {
      console.log('[AutoSendResume] [API成功] 简历发送成功')
      return true
    } else {
      console.log('[AutoSendResume] [API错误] 简历发送失败:', response.message)
      return false
    }
  } catch (err) {
    console.error('[AutoSendResume] [API异常] 发送简历出错:', err.message)
    console.error('[AutoSendResume] [错误详情]', err.stack)
    return false
  }
}

/**
 * 启动自动发送简历轮询
 * @param {import('puppeteer').Page} page
 * @param {Object} hooks
 * @returns {Function}
 */
export function startAutoSendResumePolling(page, hooks) {
  const config = readConfigFile('boss.json')
  
  if (!config.autoSendResumeEnabled) {
    console.log('[AutoSendResume] 自动发送简历功能未启用')
    return () => {}
  }

  console.log('[AutoSendResume] ==========================================')
  console.log('[AutoSendResume] 启动自动发送简历轮询（增强版+详细日志）')
  console.log('[AutoSendResume] ==========================================')
  
  if (config.autoSendResumeUseLabelFilter) {
    console.log(`[AutoSendResume] 配置: 标签筛选="${config.autoSendResumeLabelName ?? '全部'}" (ID=${config.autoSendResumeLabelId ?? 0})`)
  } else {
    console.log('[AutoSendResume] 配置: 全部好友')
  }
  console.log(`[AutoSendResume] 配置: 轮询间隔=${POLL_INTERVAL_MS/1000}秒`)

  let isRunning = true
  const processedRequests = new Set()
  let currentUserId = null
  let pollCount = 0

  const poll = async () => {
    // 首次运行获取当前用户ID
    if (!currentUserId) {
      try {
        console.log('[AutoSendResume] [初始化] 获取当前用户信息...')
        const userInfo = await page.evaluate(() => {
          const mainWrap = document.querySelector('.main-wrap, #app, #container')
          return mainWrap?.__vue__?.$store?.state?.userInfo || window.__INITIAL_STATE__?.userInfo
        })
        currentUserId = String(userInfo?.encryptUserId || userInfo?.uid || '')
        console.log(`[AutoSendResume] [初始化] 当前用户ID: ${currentUserId}`)
        hooks.logInfo?.(`[AutoSendResume] 已启动，用户ID: ${currentUserId?.substring(0, 20)}...`)
      } catch (e) {
        console.error('[AutoSendResume] [初始化] 获取用户信息失败:', e.message)
      }
    }

    while (isRunning) {
      pollCount++
      console.log(`\n[AutoSendResume] ==========================================`)
      console.log(`[AutoSendResume] [第${pollCount}轮轮询开始] ${new Date().toLocaleString()}`)
      console.log(`[AutoSendResume] ==========================================`)
      
      try {
        if (page.isClosed()) {
          console.log('[AutoSendResume] [状态] 页面已关闭，停止轮询')
          break
        }

        const labelFilterOptions = config.autoSendResumeUseLabelFilter
          ? {
              useLabelFilter: true,
              labelId: config.autoSendResumeLabelId ?? 0,
              labelName: config.autoSendResumeLabelName ?? '全部'
            }
          : {}
        
        // 获取需要发送简历的列表
        const pendingRequests = await getPendingResumeRequests(page, labelFilterOptions, currentUserId)
        
        if (pendingRequests.length === 0) {
          console.log('[AutoSendResume] [结果] 未发现需要发送简历的请求')
          hooks.logInfo?.(`[AutoSendResume] 第${pollCount}轮检查完成，暂无简历请求`)
        } else {
          console.log(`[AutoSendResume] [结果] 发现 ${pendingRequests.length} 个简历请求:`)
          pendingRequests.forEach((req, i) => {
            console.log(`  [${i + 1}] ${req.name} (${req.company}) - "${req.requestMessage?.substring(0, 30)}..."`)
          })
        }
        
        // 过滤掉已处理的
        const newRequests = pendingRequests.filter(
          item => !processedRequests.has(item.uniqueId)
        )

        if (newRequests.length === 0 && pendingRequests.length > 0) {
          console.log('[AutoSendResume] [结果] 所有请求已处理过，跳过')
        }

        if (newRequests.length > 0) {
          console.log(`[AutoSendResume] [结果] ${newRequests.length} 个新请求待处理`)

          // 获取简历列表
          const resumeList = await getResumeList(page)
          
          if (resumeList.length === 0) {
            console.log('[AutoSendResume] [警告] 未找到可用简历')
            hooks.logInfo?.('[AutoSendResume] 未找到可用简历，请先上传简历')
          } else {
            const defaultResume = resumeList[0]
            console.log(`[AutoSendResume] [发送] 将使用简历: ${defaultResume.showName}`)

            // 逐个发送简历
            for (const request of newRequests) {
              if (!isRunning) break

              console.log(`\n[AutoSendResume] [发送] ======= 向 ${request.name} (${request.company}) =======`)
              console.log(`[AutoSendResume] [发送] 触发消息: "${request.requestMessage?.substring(0, 50)}..."`)
              hooks.logInfo?.(`[AutoSendResume] 向 ${request.name} (${request.jobName}) 发送简历`)

              const success = await sendResumeToBoss(
                page,
                request.securityId,
                defaultResume.resumeId
              )

              if (success) {
                processedRequests.add(request.uniqueId)
                hooks.logInfo?.(`[AutoSendResume] ✓ 已成功向 ${request.name} 发送简历`)
                console.log(`[AutoSendResume] [发送] ✓ 成功，等待冷却...`)
                await sleep(3000 + Math.random() * 2000)
              } else {
                hooks.logInfo?.(`[AutoSendResume] ✗ 向 ${request.name} 发送简历失败`)
                console.log(`[AutoSendResume] [发送] ✗ 失败`)
              }
            }
          }
        }

        console.log(`\n[AutoSendResume] [第${pollCount}轮轮询完成] 累计处理 ${processedRequests.size} 个请求`)
        
      } catch (err) {
        console.error('[AutoSendResume] [错误] 轮询出错:', err.message)
        console.error('[AutoSendResume] [错误详情]', err.stack)
        hooks.logInfo?.(`[AutoSendResume] 轮询出错: ${err.message}`)
      }

      console.log(`[AutoSendResume] [等待] ${POLL_INTERVAL_MS/1000}秒后开始下一轮...`)
      await sleep(POLL_INTERVAL_MS)
    }
  }

  poll().catch(err => {
    console.error('[AutoSendResume] [致命错误] 轮询任务异常退出:', err)
  })

  return () => {
    console.log('[AutoSendResume] [停止] 用户停止轮询')
    isRunning = false
  }
}
