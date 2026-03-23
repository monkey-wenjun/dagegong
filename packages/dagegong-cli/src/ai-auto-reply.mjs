/**
 * AI 自动回复服务 - CLI 版本
 * 轮询检测 BOSS 新消息，调用 Dify API 自动回复
 * 
 * 与 UI 版本保持一致：
 * 1. 使用独立的 ai-auto-reply.json 配置文件
 * 2. 支持对话总结（使用 llm.json 中的配置）
 * 3. 基于浏览器页面获取消息
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { sendMessage } from './send-message.mjs';

// 配置文件路径
const CLI_RUNTIME_DIR = process.env.DAGEGONG_RUNTIME_DIR || path.join(os.homedir(), '.dagegong-cli');
const AI_REPLY_CONFIG_FILE = path.join(CLI_RUNTIME_DIR, 'config', 'ai-auto-reply.json');
const REPLIED_MESSAGES_FILE = path.join(CLI_RUNTIME_DIR, 'ai-auto-replied-messages.json');
const LOG_FILE = path.join(CLI_RUNTIME_DIR, 'logs', 'ai-auto-reply.log');

// 确保日志目录存在
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 日志函数：同时输出到控制台和文件
function log(level, message, data) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  
  // 输出到控制台
  if (level === 'ERROR') {
    console.error(logMessage, data || '');
  } else {
    console.log(logMessage, data || '');
  }
  
  // 写入文件
  const fileMessage = logMessage + (data ? ' ' + JSON.stringify(data) : '') + '\n';
  fs.appendFileSync(LOG_FILE, fileMessage);
}

// 重定向 console.log 和 console.error 到文件
const originalLog = console.log;
const originalError = console.error;

console.log = function(...args) {
  originalLog.apply(console, args);
  const message = args.join(' ');
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [LOG] ${message}\n`);
};

console.error = function(...args) {
  originalError.apply(console, args);
  const message = args.join(' ');
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [ERROR] ${message}\n`);
};

// 默认检查间隔（毫秒）
const DEFAULT_CHECK_INTERVAL = 120000; // 2分钟

// 默认提示词模板
const defaultSummaryPrompt = `请分析以下招聘对话记录，并提取关键信息。

【对话记录】
{messages}

【分析任务】
1. 首先检查对话内容是否涉及"保险销售"相关岗位
2. 如果涉及保险销售岗位，设置 shouldReject 为 true，并生成婉拒回复
3. 如果不涉及保险销售，正常总结对话

【输出格式】
必须输出以下 JSON 格式：
{
  "shouldReject": false/true,
  "rejectReason": "如果 shouldReject 为 true，填写原因",
  "rejectReply": "如果 shouldReject 为 true，生成委婉拒绝的回复",
  "summary": "一句话总结对话状态",
  "keyPoints": ["关键信息点1", "关键信息点2"],
  "advantages": ["候选人应该强调的优势1", "优势2"]
}

只输出 JSON，不要其他内容`;

// 默认配置
const defaultConfig = {
  enabled: false,
  apiUrl: '',           // Dify API URL (如: http://192.168.1.29/v1/chat-messages)
  apiKey: '',           // Dify API Key
  enableSummary: false, // 是否启用对话总结
  summaryPrompt: defaultSummaryPrompt,
  checkInterval: DEFAULT_CHECK_INTERVAL
};

// 跟踪正在处理的消息ID
const processingMessageIds = new Set();

/**
 * 读取 AI 自动回复配置
 */
export function getConfig() {
  try {
    if (fs.existsSync(AI_REPLY_CONFIG_FILE)) {
      const content = fs.readFileSync(AI_REPLY_CONFIG_FILE, 'utf8');
      const savedConfig = JSON.parse(content);
      return { ...defaultConfig, ...savedConfig };
    }
  } catch (err) {
    console.error('[AiAutoReply] 读取配置失败:', err.message);
  }
  return defaultConfig;
}

/**
 * 保存 AI 自动回复配置
 */
export function saveConfig(config) {
  try {
    const configDir = path.dirname(AI_REPLY_CONFIG_FILE);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(AI_REPLY_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    console.log('[AiAutoReply] 配置已保存到:', AI_REPLY_CONFIG_FILE);
  } catch (err) {
    console.error('[AiAutoReply] 保存配置失败:', err.message);
  }
}

/**
 * 读取已回复消息记录
 */
function loadRepliedMessages() {
  try {
    if (fs.existsSync(REPLIED_MESSAGES_FILE)) {
      const content = fs.readFileSync(REPLIED_MESSAGES_FILE, 'utf8');
      const data = JSON.parse(content);
      return new Set(data.repliedIds || []);
    }
  } catch (err) {
    console.error('[AiAutoReply] 读取已回复记录失败:', err.message);
  }
  return new Set();
}

/**
 * 保存已回复消息记录
 */
function saveRepliedMessages(repliedIds) {
  try {
    fs.writeFileSync(REPLIED_MESSAGES_FILE, JSON.stringify({ 
      repliedIds: Array.from(repliedIds),
      updatedAt: new Date().toISOString()
    }, null, 2), 'utf8');
  } catch (err) {
    console.error('[AiAutoReply] 保存已回复记录失败:', err.message);
  }
}

/**
 * 设置请求拦截器来调试API调用
 */
async function setupRequestInterceptor(page) {
  try {
    await page.evaluateOnNewDocument(() => {
      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        const url = args[0];
        if (typeof url === 'string' && url.includes('/wapi/')) {
          console.log('[INTERCEPT] Request:', url);
        }
        const response = await originalFetch.apply(this, args);
        return response;
      };
    });
  } catch (err) {
    console.log('[AiAutoReply] [DEBUG] 设置拦截器失败:', err.message);
  }
}

// API 端点
// labelId: 0=全部, 1=新消息, 2=已交换联系方式, 3=已投递, 4=感兴趣
const GEEK_FRIEND_LIST_API = (labelId = 1) => `https://www.zhipin.com/wapi/zprelation/friend/geekFilterByLabel?labelId=${labelId}&page=1&pageSize=100`;

// 使用 labelId=1 只获取有新消息的好友
const HISTORY_MSG_API = 'https://www.zhipin.com/wapi/zpchat/geek/historyMsg';

/**
 * 获取聊天好友列表
 */
async function getChatFriendList(page) {
  console.log('[AiAutoReply] [DEBUG] ========== 开始获取好友列表 ==========');
  await setupRequestInterceptor(page);
  
  try {
    const currentUrl = page.url();
    if (!currentUrl.includes('/chat')) {
      console.log('[AiAutoReply] [DEBUG] 导航到聊天页面...');
      await page.goto('https://www.zhipin.com/web/geek/chat', {
        waitUntil: 'networkidle2',
        timeout: 10000
      });
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (navErr) {
    console.log('[AiAutoReply] [DEBUG] 导航到聊天页面失败:', navErr.message);
  }
  
  try {
    // 使用 labelId=0 获取全部，然后通过 unreadCount 过滤
    const labelId = 0;
    console.log(`[AiAutoReply] [DEBUG] 获取好友列表 (labelId=${labelId}, 0=全部)...`);
    
    const response = await page.evaluate(async (url) => {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'accept': 'application/json, text/plain, */*',
          'x-requested-with': 'XMLHttpRequest'
        },
        credentials: 'include'
      });
      return res.json();
    }, GEEK_FRIEND_LIST_API(labelId));
    
    if (response.code !== 0) {
      console.log(`[AiAutoReply] [DEBUG] API 失败:`, response.message || response.msg);
      return [];
    }
    
    const rawFriendList = response.zpData?.friendList || response.zpData?.list || [];
    console.log(`[AiAutoReply] [DEBUG] ✅ 获取到 ${rawFriendList.length} 个有新消息的好友`);
    
    // 打印第一个原始数据的完整结构
    if (rawFriendList.length > 0) {
      console.log('[AiAutoReply] [DEBUG] 原始数据第一个元素:', JSON.stringify(rawFriendList[0], null, 2));
    }
    
    const friendList = rawFriendList.map(f => ({
      encryptBossId: f.encryptFriendId || f.encryptBossId,
      encryptFriendId: f.encryptFriendId,
      friendId: f.friendId,
      name: f.name || '未知',
      brandName: f.brandName || '未知公司',
      jobName: f.jobName || '',
      lastText: f.lastText || f.lastTExt || '[新消息]',
      lastTS: f.updateTime || f.lastTS,
      unreadCount: f.unreadCount || 1
    }));
    
    if (friendList.length > 0) {
      console.log('[AiAutoReply] [DEBUG] 好友列表(原始):');
      friendList.forEach((f, i) => {
        console.log(`[AiAutoReply] [DEBUG] [${i + 1}] ${f.name} | unread:${f.unreadCount} | ${f.lastText?.substring(0, 30)}...`);
      });
    }
    
    console.log('[AiAutoReply] [DEBUG] ========== 好友列表获取完成 ==========');
    return friendList;
  } catch (err) {
    console.error('[AiAutoReply] [ERROR] 获取好友列表失败:', err.message);
    return [];
  }
}

/**
 * 获取聊天记录
 */
async function getChatHistory(page, encryptBossId, encryptJobId, securityId, friendId) {
  console.log('[AiAutoReply] [DEBUG] ---------- 开始获取聊天记录 ----------');
  console.log('[AiAutoReply] [DEBUG] BOSS ID:', encryptBossId?.substring(0, 15) + '...');
  
  try {
    const paramSets = [];
    
    if (encryptBossId) {
      const params1 = new URLSearchParams({
        bossId: encryptBossId,
        maxMsgId: '0',
        c: '20',
        page: '1',
        src: '0'
      });
      if (encryptJobId) params1.append('jobId', encryptJobId);
      if (securityId) params1.append('securityId', securityId);
      paramSets.push(params1.toString());
      
      paramSets.push(new URLSearchParams({
        bossId: encryptBossId,
        maxMsgId: '0',
        c: '20'
      }).toString());
    }
    
    if (friendId) {
      paramSets.push(new URLSearchParams({
        friendId: String(friendId),
        maxMsgId: '0',
        c: '20'
      }).toString());
    }
    
    for (const paramStr of paramSets) {
      console.log('[AiAutoReply] [DEBUG] 尝试参数:', paramStr);
      
      try {
        const response = await page.evaluate(async (apiUrl, params) => {
          const res = await fetch(`${apiUrl}?${params}`, {
            method: 'GET',
            headers: {
              'accept': 'application/json, text/plain, */*',
              'x-requested-with': 'XMLHttpRequest'
            },
            credentials: 'include'
          });
          return res.json();
        }, HISTORY_MSG_API, paramStr);
        
        if (response.code === 0) {
          const messages = response.zpData?.messages || [];
          console.log(`[AiAutoReply] [DEBUG] 获取到 ${messages.length} 条历史消息`);
          
          // 打印完整消息列表用于调试
          if (messages.length > 0) {
            console.log('[AiAutoReply] [DEBUG] 完整消息列表(按API返回顺序):');
            messages.forEach((m, i) => {
              const text = m.body?.text || m.pushText || '[无文本]';
              // 打印消息对象的所有字段名和值
              console.log(`[AiAutoReply] [DEBUG] [${i}] 字段: ${Object.keys(m).join(',')}`);
              console.log(`[AiAutoReply] [DEBUG]       from=${JSON.stringify(m.from)}, to=${JSON.stringify(m.to)}`);
              console.log(`[AiAutoReply] [DEBUG]       received=${m.received}, pushText=${m.pushText?.substring(0,20)}`);
              console.log(`[AiAutoReply] [DEBUG]       内容: ${text.substring(0, 40)}...`);
            });
          }
          
          console.log('[AiAutoReply] [DEBUG] ---------- 聊天记录获取完成 ----------');
          return messages;
        }
      } catch (e) {
        console.log('[AiAutoReply] [DEBUG] 参数尝试失败:', e.message);
      }
    }
    
    return [];
  } catch (err) {
    console.error('[AiAutoReply] [ERROR] 获取聊天记录失败:', err.message);
    return [];
  }
}

/**
 * 调用 Dify API 生成回复
 */
async function callDifyAPI(query, config) {
  const { apiUrl, apiKey } = config;
  
  if (!apiUrl || !apiKey) {
    console.error('[AiAutoReply] Dify API 配置不完整');
    return null;
  }
  
  try {
    console.log('[AiAutoReply] 调用 Dify API...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        inputs: {},
        query: query,
        response_mode: 'blocking',
        conversation_id: '',
        user: 'dagegong-cli'
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.answer) {
      console.log('[AiAutoReply] Dify 回复:', data.answer.substring(0, 50) + '...');
      return data.answer;
    } else {
      console.error('[AiAutoReply] Dify 返回空回复');
      return null;
    }
  } catch (err) {
    console.error('[AiAutoReply] Dify API 调用失败:', err.message);
    return null;
  }
}

/**
 * 调用 LLM 进行对话总结
 */
async function callLlmSummary(chatHistory, config) {
  try {
    const cliConfig = readCliConfig();
    const llmConfig = cliConfig?.effective?.llmConfig?.[0];
    
    if (!llmConfig?.providerApiSecret) {
      console.log('[AiAutoReply] LLM 未配置，跳过总结');
      return null;
    }
    
    const messagesText = chatHistory.map(h => {
      const role = h.role === 'user' ? 'BOSS' : '我';
      return `${role}: ${h.content}`;
    }).join('\n');
    
    const prompt = config.summaryPrompt.replace('{messages}', messagesText);
    
    console.log('[AiAutoReply] 调用 LLM 总结对话...');
    
    const response = await fetch(llmConfig.providerCompleteApiUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llmConfig.providerApiSecret}`
      },
      body: JSON.stringify({
        model: llmConfig.model || 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是一个专业的招聘对话分析助手。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3
      })
    });
    
    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (content) {
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.log('[AiAutoReply] LLM 返回格式解析失败');
      }
    }
    
    return null;
  } catch (err) {
    console.error('[AiAutoReply] LLM 总结失败:', err.message);
    return null;
  }
}

/**
 * 读取 CLI 配置
 */
function readCliConfig() {
  try {
    const configPath = path.join(CLI_RUNTIME_DIR, 'config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (err) {
    console.error('[AiAutoReply] 读取 CLI 配置失败:', err.message);
  }
  return null;
}

/**
 * 记录日志
 */
function logInfo(message, data) {
  console.log(`[${new Date().toISOString()}] [INFO] ${message}`, data ? JSON.stringify(data, null, 2) : '');
}

/**
 * 构建 Dify 查询内容
 */
function buildDifyQuery(bossName, jobName, chatHistory, lastMessage) {
  const historyText = chatHistory.map(msg => {
    const role = msg.role === 'user' ? 'BOSS' : '我';
    return `${role}: ${msg.content}`;
  }).join('\n');
  
  return `你是求职者，正在与招聘方沟通。

职位：${jobName || '未知'}
招聘方：${bossName || '未知'}

历史对话：
${historyText || '（无历史对话）'}

对方最新消息：${lastMessage}

请生成一个专业、礼貌的回复。要求：
1. 回复要简洁，不超过 100 字
2. 针对对方的具体问题回答
3. 保持友好、专业的语气
4. 不要重复之前说过的话

直接输出回复内容，不要添加任何解释。`;
}

/**
 * 处理单个对话
 */
async function processSingleChat(page, friend, repliedIds, config) {
  // 【关键】重新获取聊天记录，确保判断准确
  const messages = await getChatHistory(
    page,
    friend.encryptBossId || friend.encryptFriendId,
    friend.encryptJobId,
    friend.securityId,
    friend.friendId
  );
  
  // 【修复】按时间戳排序消息，确保获取真正的最新消息
  const textMessages = messages
    .filter(m => m.body?.type === 1)
    .sort((a, b) => (b.time || 0) - (a.time || 0)); // 按时间降序，最新的在前
  
  const lastMessage = textMessages[0]; // 最新消息在第一条
  
  if (!lastMessage) {
    console.log(`[AiAutoReply] [DEBUG] ${friend.name || '未知'}: 没有文本消息`);
    return { success: false, reason: 'no_text_message' };
  }
  
  // 【调试】打印消息时间戳信息
  console.log(`[AiAutoReply] [DEBUG] 最新消息时间戳: ${lastMessage.time}, 内容: ${lastMessage.body?.text?.substring(0, 30)}...`);
  
  // 检查是否已回复（用消息内容做ID）
  const messageId = `${friend.encryptBossId}_${lastMessage.body?.text?.slice(0, 20)}`;
  
  if (repliedIds.has(messageId)) {
    return { success: false, reason: 'already_replied' };
  }
  
  if (processingMessageIds.has(messageId)) {
    return { success: false, reason: 'processing' };
  }
  
  // 【关键】严格检查：最后消息必须来自 BOSS（不是我发的）
  // API返回的是from.uid而不是from.userId
  const fromUid = lastMessage.from?.uid;
  const currentUserId = config.currentUserId;
  const isFromMe = fromUid && currentUserId && String(fromUid) === String(currentUserId);
  
  console.log(`[AiAutoReply] [DEBUG] 检查消息: from.uid=${fromUid}, currentUser=${currentUserId}, isFromMe=${isFromMe}`);
  console.log(`[AiAutoReply] [DEBUG] 消息内容: ${lastMessage.body?.text?.substring(0, 50)}...`);
  console.log(`[AiAutoReply] [DEBUG] received=${lastMessage.received} (类型: ${typeof lastMessage.received})`);
  
  if (isFromMe) {
    console.log(`[AiAutoReply] [DEBUG] ${friend.name || '未知'}: ❌ 跳过 - 这是我自己发的消息`);
    return { success: false, reason: 'last_is_self' };
  }
  
  // 额外检查：如果消息内容为空或只有 pushText 没有 body.text，可能是未加载完整
  if (!lastMessage.body?.text && lastMessage.pushText) {
    console.log(`[AiAutoReply] [DEBUG] ${friend.name || '未知'}: ⚠️ 消息可能未完全加载（只有pushText），建议先在APP中打开对话`);
    // 继续处理，使用 pushText 作为备用
  }
  
  console.log(`[AiAutoReply] [DEBUG] ${friend.name || '未知'}: ✅ 确认是BOSS发来的消息`);
  
  const lastText = lastMessage?.body?.text || lastMessage?.pushText || '';
  
  // 【新增】过滤无意义的消息（图片、表情、简单回应）
  const meaninglessPatterns = [
    /^\s*$/,                              // 空消息
    /^嗯+$/,                              // 嗯、嗯嗯
    /^[哦喔哦好]+[嗯呢吧]*$/,             // 哦、喔、好、好呢、好吧、嗯呢
    /^[OKok]+[👌]*$/,                     // OK、ok
    /^[👌🙏👍✅💪🔥]+$/,                  // 纯表情符号
    /^收到$/,                             // 收到
    /^行+$/,                              // 行
    /^(好的|知道|了解|明白)了?$/,         // 好的、知道了、了解了、明白了
    /^谢谢[你呢]?$/,                      // 谢谢、谢谢你
    /^[图片表情]$/,                       // 图片/表情标记
  ];
  
  const isMeaningless = meaninglessPatterns.some(pattern => pattern.test(lastText.trim()));
  
  if (isMeaningless || !lastText.trim()) {
    console.log(`[AiAutoReply] [DEBUG] ${friend.name || '未知'}: ⏭️ 跳过 - 消息无意义("${lastText.substring(0, 30)}")`);
    return { success: false, reason: 'meaningless_message' };
  }
  
  processingMessageIds.add(messageId);
  
  try {
    console.log(`\n[AiAutoReply] 处理对话: ${friend.name} @ ${friend.brandName}`);
    console.log(`[AiAutoReply] 最后消息(BOSS): ${lastText.substring(0, 50)}...`);
    
    // 【新增】检测婉拒消息
    const rejectPatterns = [
      /不太匹配|不太合适|不太符合|不匹配/i,
      /无法进入面试|不适合这个|不适合该/i,
      /婉拒|抱歉.*不适合|遗憾.*不适合/i,
      /简历.*评估.*不|技能.*不.*匹配/i,
      /暂时.*不.*合适|目前.*不.*匹配/i
    ];
    const isRejectMessage = rejectPatterns.some(pattern => pattern.test(lastText));
    
    if (isRejectMessage) {
      console.log(`[AiAutoReply] [DEBUG] 检测到婉拒消息，准备礼貌回复...`);
    }
    
    const chatHistory = messages
      .filter(msg => msg.body?.type === 1)
      .map(msg => ({
        role: msg.received === true ? 'user' : 'assistant',
        content: msg.body?.text || msg.pushText || '[图片/文件]'
      }));
    
    // LLM 总结
    let summaryResult = null;
    if (config.enableSummary && chatHistory.length > 0) {
      summaryResult = await callLlmSummary(chatHistory, config);
    }
    
    // 婉拒处理（基于关键词或LLM判断）
    if (isRejectMessage || (summaryResult?.shouldReject && summaryResult.rejectReply)) {
      // 如果是关键词检测到的婉拒，但没有LLM回复，使用默认感谢语
      let rejectReply = summaryResult?.rejectReply;
      if (!rejectReply && isRejectMessage) {
        rejectReply = `好的，感谢您的反馈和宝贵时间。祝贵司早日找到合适的人选，也祝您工作顺利！`;
      }
      
      console.log(`[AiAutoReply] 婉拒回复: ${rejectReply.substring(0, 50)}...`);
      
      // 发送婉拒回复
      const sent = await sendMessage(
        friend.encryptBossId || friend.encryptFriendId,
        friend.encryptJobId,
        friend.securityId,
        rejectReply,
        friend.name,
        friend.jobName,
        friend.lastMessage?.body?.text || friend.lastMessage?.pushText,
        friend.brandName
      );
      
      if (sent) {
        repliedIds.add(messageId);
        saveRepliedMessages(repliedIds);
        console.log(`[AiAutoReply] ✓ 婉拒回复成功`);
        return { success: true, reply: rejectReply, isReject: true };
      }
      return { success: false, reason: 'send_failed' };
    }
    
    // 构建 Query
    let query = lastText;
    if (summaryResult && !summaryResult.shouldReject) {
      const context = chatHistory.map(h => {
        const role = h.role === 'user' ? 'BOSS' : '我';
        return `${role}: ${h.content}`;
      }).join('\n');
      
      query = `【对话背景】
${summaryResult.summary}

关键信息：
${summaryResult.keyPoints?.map(p => `- ${p}`).join('\n') || '无'}

【历史对话】
${context}

【最新消息】
BOSS 说："${lastText}"

请基于以上背景，给出一个专业、得体且针对性的回复。回复要：
1. 体现对岗位的了解和兴趣
2. 回应 BOSS 的具体问题
3. 展示匹配的优势
4. 保持礼貌和专业`;
    } else if (chatHistory.length > 0) {
      query = buildDifyQuery(friend.name, friend.jobName, chatHistory, lastText);
    }
    
    // 调用 Dify
    const reply = await callDifyAPI(query, config);
    if (!reply) {
      return { success: false, reason: 'api_error' };
    }
    
    // 发送回复
    const sent = await sendMessage(
      friend.encryptBossId || friend.encryptFriendId,
      friend.encryptJobId,
      friend.securityId,
      reply,
      friend.name,
      friend.jobName,
      friend.lastMessage?.body?.text || friend.lastMessage?.pushText,
      friend.brandName
    );
    
    if (sent) {
      repliedIds.add(messageId);
      saveRepliedMessages(repliedIds);
      console.log(`[AiAutoReply] ✓ 回复成功: ${reply.substring(0, 50)}...`);
      logInfo('AI 自动回复成功', {
        bossName: friend.name,
        company: friend.brandName,
        jobName: friend.jobName,
        reply: reply.substring(0, 100)
      });
      return { success: true, reply };
    } else {
      return { success: false, reason: 'send_failed' };
    }
    
  } finally {
    processingMessageIds.delete(messageId);
  }
}

/**
 * 检查并回复未读消息
 */
async function checkAndReply(page, config) {
  console.log('\n[AiAutoReply] ====== 开始检查未读消息 ======');
  
  const repliedIds = loadRepliedMessages();
  const friendList = await getChatFriendList(page);
  
  if (friendList.length === 0) {
    console.log('[AiAutoReply] 没有需要回复的新消息');
    return [];
  }
  
  // 过滤：只处理有未读消息的对话
  const unreadFriends = friendList.filter(f => f.unreadCount > 0);
  console.log(`[AiAutoReply] 总共 ${friendList.length} 个对话，其中 ${unreadFriends.length} 个有未读消息`);
  
  if (unreadFriends.length === 0) {
    console.log('[AiAutoReply] 没有未读消息需要回复');
    return [];
  }
  
  const needReplyList = [];
  
  for (const friend of unreadFriends.slice(0, 20)) {
    const lastText = friend.lastText || friend.lastTExt;
    if (!lastText) continue;
    
    // 【调试】打印好友信息
    console.log(`[AiAutoReply] [DEBUG] 处理好友: ${friend.name} @ ${friend.brandName}`);
    console.log(`[AiAutoReply] [DEBUG]   encryptBossId: ${friend.encryptBossId?.substring(0, 20)}...`);
    console.log(`[AiAutoReply] [DEBUG]   encryptFriendId: ${friend.encryptFriendId?.substring(0, 20)}...`);
    console.log(`[AiAutoReply] [DEBUG]   friendId: ${friend.friendId}`);
    
    const bossId = friend.encryptBossId || friend.encryptFriendId;
    console.log(`[AiAutoReply] [DEBUG]   使用ID: ${bossId?.substring(0, 20)}...`);
    
    const messages = await getChatHistory(
      page,
      bossId,
      friend.encryptJobId,
      friend.securityId,
      friend.friendId
    );
    
    const textMessages = messages.filter(m => m.body?.type === 1);
    // 从日志看，API返回的消息是按时间正序（旧->新），最后一条是最新的
    const lastMessage = textMessages[textMessages.length - 1];
    
    if (!lastMessage) {
      console.log(`[AiAutoReply] [DEBUG] ${friend.name || '未知'}: 没有文本消息，跳过`);
      continue;
    }
    
    // 调试：打印最后消息的 received 字段
    console.log(`[AiAutoReply] [DEBUG] 最后消息 received=${lastMessage.received} (类型: ${typeof lastMessage.received})`);
    console.log(`[AiAutoReply] [DEBUG] 最后消息内容: ${lastMessage.body?.text?.substring(0, 50)}...`);
    
    // 严格检查：received 必须是布尔值 true 或字符串 "true"
    const isReceived = lastMessage.received === true || lastMessage.received === 'true' || lastMessage.received === 1;
    if (!isReceived) {
      console.log(`[AiAutoReply] [DEBUG] ${friend.name || '未知'}: 最后消息是自己发的(received=${lastMessage.received})，不需要回复`);
      continue;
    }
    
    // 提取 BOSS 信息
    let bossName = friend.name;
    let brandName = friend.brandName;
    let jobName = friend.jobName;
    
    // 调试：打印 jobDesc 的所有字段
    const jobMsg = messages.find(m => m.body?.jobDesc);
    if (jobMsg) {
      console.log('[AiAutoReply] [DEBUG] jobDesc 字段:', Object.keys(jobMsg.body.jobDesc));
      console.log('[AiAutoReply] [DEBUG] jobDesc.boss 字段:', Object.keys(jobMsg.body.jobDesc.boss || {}));
    }
    
    if (!bossName || bossName === '未知') {
      if (jobMsg?.body?.jobDesc?.boss?.name) bossName = jobMsg.body.jobDesc.boss.name;
    }
    
    if (!brandName || brandName === '未知公司') {
      // 从 jobDesc.company 获取公司名（brandName 不存在）
      if (jobMsg?.body?.jobDesc?.company) brandName = jobMsg.body.jobDesc.company;
    }
    
    if (!jobName) {
      if (jobMsg?.body?.jobDesc?.title) jobName = jobMsg.body.jobDesc.title;
    }
    
    const enrichedFriend = {
      ...friend,
      name: bossName || friend.name || '未知',
      brandName: brandName || friend.brandName || '未知公司',
      jobName: jobName || friend.jobName || '',
      lastMessage,
      messages
    };
    
    console.log(`[AiAutoReply] [DEBUG] 提取信息: ${enrichedFriend.name} @ ${enrichedFriend.brandName} (${enrichedFriend.jobName || '无职位'})`);
    
    needReplyList.push(enrichedFriend);
    await new Promise(r => setTimeout(r, 300));
  }
  
  console.log(`[AiAutoReply] 成功获取 ${needReplyList.length} 个对话的聊天记录`);
  
  const results = [];
  
  // 处理所有需要回复的对话
  for (const friend of needReplyList) {
    const result = await processSingleChat(page, friend, repliedIds, config);
    results.push({ friend: friend.name, ...result });
    
    // 每个对话之间稍作延迟
    if (result.success) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  console.log(`[AiAutoReply] ====== 检查完成，成功回复 ${successCount}/${needReplyList.length} 个 ======\n`);
  
  return results;
}

/**
 * 启动 AI 自动回复服务（使用独立浏览器实例）
 */
export async function startAiAutoReply(options = {}) {
  const aiConfig = getConfig();
  
  if (!aiConfig.enabled) {
    console.log('[AiAutoReply] AI 自动回复未启用');
    return null;
  }
  
  if (!aiConfig.apiUrl || !aiConfig.apiKey) {
    console.error('[AiAutoReply] Dify API 配置不完整');
    return null;
  }
  
  // 保存当前用户ID，用于判断消息发送者
  aiConfig.currentUserId = options.currentUserId;
  
  const interval = options.interval || aiConfig.checkInterval || DEFAULT_CHECK_INTERVAL;
  
  console.log('[AiAutoReply] 启动 AI 自动回复服务（独立浏览器）');
  console.log(`[AiAutoReply] 检查间隔: ${interval / 1000} 秒`);
  
  // 执行一次检查
  await runCheckWithNewBrowser(aiConfig);
  
  // 设置定时器
  const timer = setInterval(async () => {
    try {
      await runCheckWithNewBrowser(aiConfig);
    } catch (err) {
      console.error('[AiAutoReply] 检查过程出错:', err.message);
    }
  }, interval);
  
  return {
    stop: () => {
      console.log('[AiAutoReply] 停止 AI 自动回复服务');
      clearInterval(timer);
    },
    checkOnce: () => runCheckWithNewBrowser(aiConfig)
  };
}

/**
 * 检查投递是否已完成（达到 limit）
 */
function isJobApplyFinished() {
  return process.env.DAGEGONG_SHOULD_STOP === '1' || process.env.DAGEGONG_APPLY_FINISHED === 'true';
}

/**
 * 使用新浏览器实例运行检查
 */
async function runCheckWithNewBrowser(config) {
  // 【新增】如果投递已完成，跳过检查
  if (isJobApplyFinished()) {
    console.log('[AiAutoReply] 投递已完成，跳过本次检查');
    return [];
  }
  
  const { initPuppeteer } = await import('@dagegong/geek-auto-start-chat-with-boss/index.mjs');
  const { readStorageFile } = await import('@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs');
  
  const { puppeteer } = await initPuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // 设置 cookie
    const cookies = readStorageFile('boss-cookies.json') || [];
    for (const cookie of cookies) {
      await page.setCookie(cookie);
    }
    
    // 检查并回复
    await checkAndReply(page, config);
    
  } finally {
    await browser.close();
  }
}

/**
 * 单次检查
 */
export async function checkUnreadOnce(page) {
  const aiConfig = getConfig();
  
  if (!aiConfig?.enabled) {
    console.log('[AiAutoReply] AI 自动回复未启用');
    return [];
  }
  
  return checkAndReply(page, aiConfig);
}

export default { startAiAutoReply, checkUnreadOnce, getConfig, saveConfig };
