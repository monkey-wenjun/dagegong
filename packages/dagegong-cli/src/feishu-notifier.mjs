/**
 * 飞书通知模块
 */

import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

/**
 * 发送飞书通知
 * @param {string} webhookUrl - 飞书 webhook URL
 * @param {Object} message - 消息内容
 * @returns {Promise<void>}
 */
export function sendFeishuNotification(webhookUrl, message) {
  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    
    const data = JSON.stringify({
      msg_type: 'post',
      content: {
        post: {
          zh_cn: {
            title: message.title || 'Dagegong CLI 通知',
            content: [
              [
                {
                  tag: 'text',
                  text: message.content || ''
                }
              ]
            ]
          }
        }
      }
    });

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const client = url.protocol === 'https:' ? https : http;
    
    const req = client.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          if (result.code === 0) {
            resolve(result);
          } else {
            reject(new Error(`飞书 API 错误: ${result.msg || result.message || '未知错误'}`));
          }
        } catch (err) {
          resolve(responseData);
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

/**
 * 发送富文本飞书通知（带格式化）
 * @param {string} webhookUrl - 飞书 webhook URL
 * @param {Object} params - 消息参数
 */
export function sendRichNotification(webhookUrl, params) {
  const { title, total, success, failed, keyword, city, details } = params;
  
  const content = [
    [
      { tag: 'text', text: `📊 今日投递统计\n\n` }
    ],
    [
      { tag: 'text', text: `关键词: ${keyword || '未指定'}\n` },
      { tag: 'text', text: `城市: ${city || '未指定'}\n\n` }
    ],
    [
      { tag: 'text', text: `总计: ${total} 个职位\n` },
      { tag: 'text', text: `✅ 成功: ${success}\n` },
      { tag: 'text', text: `❌ 失败: ${failed}\n\n` }
    ]
  ];

  // 添加详细列表
  if (details && details.length > 0) {
    content.push([{ tag: 'text', text: '投递详情:\n' }]);
    details.slice(0, 10).forEach((item, index) => {
      const status = item.status === 'success' ? '✅' : '❌';
      content.push([
        { tag: 'text', text: `${index + 1}. ${status} ${item.jobName} @ ${item.company}\n` }
      ]);
    });
    
    if (details.length > 10) {
      content.push([{ tag: 'text', text: `... 还有 ${details.length - 10} 个职位` }]);
    }
  }

  return sendFeishuNotification(webhookUrl, {
    title: title || '📧 Dagegong 投递日报',
    content: content.map(c => c.map(i => i.text).join('')).join('')
  });
}
