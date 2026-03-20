/**
 * 自动发送简历模块
 * 当 BOSS 主动发起新招呼时，自动发送简历
 */

import { readConfigFile } from './runtime-file-utils.mjs'
import { sleep } from '@dagegong/utils/sleep.mjs'

// 新招呼标签页 API
const GEEK_FILTER_BY_LABEL_API = 'https://www.zhipin.com/wapi/zprelation/friend/geekFilterByLabel'
// 简历列表 API
const RESUME_LIST_API = 'https://www.zhipin.com/wapi/zpgeek/resume/attachment/checkbox.json'
// 发送简历 API
const EXCHANGE_RESUME_API = 'https://www.zhipin.com/wapi/zpchat/exchange/request'

// 轮询间隔（毫秒）
const POLL_INTERVAL_MS = 30 * 1000 // 30 秒

/**
 * 获取新招呼列表
 * @param {import('puppeteer').Page} page
 * @returns {Promise<Array<{securityId: string, encryptBossId: string, name: string}>>}
 */
async function getNewGreetingList(page) {
  try {
    const response = await page.evaluate(async (apiUrl) => {
      const res = await fetch(`${apiUrl}?labelId=1&name=${encodeURIComponent('新招呼')}`, {
        method: 'GET',
        headers: {
          'accept': 'application/json, text/plain, */*',
          'x-requested-with': 'XMLHttpRequest'
        },
        credentials: 'include'
      })
      return res.json()
    }, GEEK_FILTER_BY_LABEL_API)

    if (response.code !== 0) {
      console.log('[AutoSendResume] 获取新招呼列表失败:', response.message)
      return []
    }

    // 解析返回数据
    const list = response.zpData?.resultList || []
    console.log(`[AutoSendResume] 发现 ${list.length} 个新招呼`)
    
    return list.map(item => ({
      securityId: item.securityId,
      encryptBossId: item.encryptBossId,
      encryptJobId: item.encryptJobId,
      name: item.name,
      company: item.brandName,
      jobName: item.jobName,
      // 用于去重的唯一标识
      uniqueId: `${item.encryptBossId}_${item.encryptJobId}`
    }))
  } catch (err) {
    console.error('[AutoSendResume] 获取新招呼列表出错:', err)
    return []
  }
}

/**
 * 获取简历列表
 * @param {import('puppeteer').Page} page
 * @returns {Promise<Array<{resumeId: string, showName: string}>>}
 */
async function getResumeList(page) {
  try {
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

    if (response.code !== 0) {
      console.log('[AutoSendResume] 获取简历列表失败:', response.message)
      return []
    }

    const list = response.zpData?.resumeList || []
    console.log(`[AutoSendResume] 获取到 ${list.length} 份简历`)
    
    return list.map(item => ({
      resumeId: item.resumeId,
      showName: item.showName,
      suffixName: item.suffixName
    }))
  } catch (err) {
    console.error('[AutoSendResume] 获取简历列表出错:', err)
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
    const response = await page.evaluate(async (apiUrl, securityId, encryptResumeId) => {
      const params = new URLSearchParams({
        securityId: securityId,
        type: '3', // 3 表示发送简历
        encryptResumeId: encryptResumeId,
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

    if (response.code === 0) {
      console.log('[AutoSendResume] 简历发送成功')
      return true
    } else {
      console.log('[AutoSendResume] 简历发送失败:', response.message)
      return false
    }
  } catch (err) {
    console.error('[AutoSendResume] 发送简历出错:', err)
    return false
  }
}

/**
 * 启动自动发送简历轮询
 * @param {import('puppeteer').Page} page
 * @param {Object} hooks - tapable hooks
 * @returns {Function} 停止轮询的函数
 */
export function startAutoSendResumePolling(page, hooks) {
  const config = readConfigFile('boss.json')
  
  // 检查是否启用了自动发送简历
  if (!config.autoSendResumeEnabled) {
    console.log('[AutoSendResume] 自动发送简历功能未启用')
    return () => {}
  }

  console.log('[AutoSendResume] 启动自动发送简历轮询')
  hooks.logInfo?.('[AutoSendResume] 自动发送简历功能已启动')

  let isRunning = true
  const processedBosses = new Set() // 已处理的 Boss 集合，用于去重

  const poll = async () => {
    while (isRunning) {
      try {
        // 检查页面是否可用
        if (page.isClosed()) {
          console.log('[AutoSendResume] 页面已关闭，停止轮询')
          break
        }

        console.log('[AutoSendResume] 开始轮询检查新招呼...')
        
        // 1. 获取新招呼列表
        const newGreetings = await getNewGreetingList(page)
        
        if (newGreetings.length === 0) {
          console.log('[AutoSendResume] 暂无新招呼')
          await sleep(POLL_INTERVAL_MS)
          continue
        }

        // 过滤掉已处理的
        const pendingGreetings = newGreetings.filter(
          item => !processedBosses.has(item.uniqueId)
        )

        if (pendingGreetings.length === 0) {
          console.log('[AutoSendResume] 所有新招呼已处理完毕')
          await sleep(POLL_INTERVAL_MS)
          continue
        }

        console.log(`[AutoSendResume] 发现 ${pendingGreetings.length} 个未处理的新招呼`)

        // 2. 获取简历列表（只获取一次，用于所有发送）
        const resumeList = await getResumeList(page)
        
        if (resumeList.length === 0) {
          console.log('[AutoSendResume] 未找到可用简历，跳过本次发送')
          hooks.logInfo?.('[AutoSendResume] 未找到可用简历，请先上传简历')
          await sleep(POLL_INTERVAL_MS)
          continue
        }

        // 使用第一份简历
        const defaultResume = resumeList[0]
        console.log(`[AutoSendResume] 将使用简历: ${defaultResume.showName}`)

        // 3. 逐个发送简历
        for (const greeting of pendingGreetings) {
          if (!isRunning) break

          console.log(`[AutoSendResume] 正在向 ${greeting.name} (${greeting.company}) 发送简历...`)
          hooks.logInfo?.(`[AutoSendResume] 向 ${greeting.name} (${greeting.jobName}) 发送简历`)

          const success = await sendResumeToBoss(
            page,
            greeting.securityId,
            defaultResume.resumeId
          )

          if (success) {
            processedBosses.add(greeting.uniqueId)
            hooks.logInfo?.(`[AutoSendResume] 已成功向 ${greeting.name} 发送简历`)
            
            // 发送成功后等待一段时间，避免频繁请求
            await sleep(3000 + Math.random() * 2000)
          } else {
            hooks.logInfo?.(`[AutoSendResume] 向 ${greeting.name} 发送简历失败`)
          }
        }

        console.log(`[AutoSendResume] 本次轮询处理完成，已处理 ${processedBosses.size} 个 Boss`)
        
      } catch (err) {
        console.error('[AutoSendResume] 轮询出错:', err)
        hooks.logInfo?.(`[AutoSendResume] 轮询出错: ${err.message}`)
      }

      // 等待下一次轮询
      await sleep(POLL_INTERVAL_MS)
    }
  }

  // 启动轮询（不阻塞）
  poll().catch(err => {
    console.error('[AutoSendResume] 轮询任务异常退出:', err)
  })

  // 返回停止函数
  return () => {
    console.log('[AutoSendResume] 停止轮询')
    isRunning = false
  }
}
