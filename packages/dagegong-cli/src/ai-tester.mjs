/**
 * AI API 连接测试
 * 测试 DeepSeek/Dify 等 API 的连通性
 */

import { readCliConfig } from './config-exporter.mjs';

/**
 * 测试 DeepSeek API
 */
async function testDeepSeekAPI(config) {
  const url = config.providerCompleteApiUrl;
  const apiKey = config.providerApiSecret;
  const model = config.model;
  
  console.log(`\n🤖 测试 DeepSeek API`);
  console.log(`   地址: ${url}`);
  console.log(`   模型: ${model}`);
  console.log(`   密钥: ${apiKey.substring(0, 15)}...`);
  
  try {
    const response = await fetch(`${url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello, please reply "API test successful" in Chinese.' }
        ],
        max_tokens: 50,
        temperature: 0.7
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }
    
    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    
    console.log(`   ✅ API 连接成功`);
    console.log(`   📝 回复: ${reply || '(无内容)'}`);
    
    return {
      success: true,
      provider: 'deepseek',
      model: model,
      reply: reply,
      usage: data.usage
    };
    
  } catch (err) {
    console.log(`   ❌ API 连接失败: ${err.message}`);
    return {
      success: false,
      provider: 'deepseek',
      error: err.message
    };
  }
}

/**
 * 测试 Dify API
 */
async function testDifyAPI(config) {
  // Dify API 格式不同，需要特定的接口地址
  const url = config.providerCompleteApiUrl;
  const apiKey = config.providerApiSecret;
  
  console.log(`\n🤖 测试 Dify API`);
  console.log(`   地址: ${url}`);
  console.log(`   密钥: ${apiKey.substring(0, 15)}...`);
  
  try {
    // Dify 的 chat-messages 接口
    const response = await fetch(`${url}/chat-messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        inputs: {},
        query: 'Hello, please reply "API test successful" in Chinese.',
        response_mode: 'blocking',
        conversation_id: '',
        user: 'dagegong-cli-test'
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }
    
    const data = await response.json();
    const reply = data.answer;
    
    console.log(`   ✅ API 连接成功`);
    console.log(`   📝 回复: ${reply || '(无内容)'}`);
    
    return {
      success: true,
      provider: 'dify',
      reply: reply
    };
    
  } catch (err) {
    console.log(`   ❌ API 连接失败: ${err.message}`);
    return {
      success: false,
      provider: 'dify',
      error: err.message
    };
  }
}

/**
 * 测试所有配置的 AI API
 */
export async function testAllAIConfigs() {
  const config = readCliConfig();
  if (!config?.effective?.llmConfig) {
    return {
      success: false,
      error: '未找到 LLM 配置'
    };
  }
  
  const llmConfigs = config.effective.llmConfig.filter(c => c.enabled);
  
  if (llmConfigs.length === 0) {
    return {
      success: false,
      error: '没有启用的 LLM 配置'
    };
  }
  
  console.log('\n🔍 AI API 连接测试\n');
  console.log(`找到 ${llmConfigs.length} 个配置\n`);
  
  const results = [];
  
  for (const llmConfig of llmConfigs) {
    const url = llmConfig.providerCompleteApiUrl || '';
    
    let result;
    if (url.includes('deepseek')) {
      result = await testDeepSeekAPI(llmConfig);
    } else if (url.includes('dify')) {
      result = await testDifyAPI(llmConfig);
    } else {
      // 默认尝试 OpenAI 兼容格式
      result = await testDeepSeekAPI(llmConfig);
    }
    
    results.push(result);
  }
  
  // 汇总结果
  const successCount = results.filter(r => r.success).length;
  
  console.log(`\n📊 测试结果: ${successCount}/${results.length} 个 API 连接成功\n`);
  
  return {
    success: successCount > 0,
    total: results.length,
    successCount: successCount,
    results: results
  };
}

/**
 * 生成打招呼消息（实际使用 AI）
 */
export async function generateGreetingMessage(jobInfo, resumeInfo) {
  const config = readCliConfig();
  const llmConfig = config?.effective?.llmConfig?.find(c => c.enabled);
  
  if (!llmConfig?.providerApiSecret) {
    return null;
  }
  
  const prompt = `请根据以下职位信息生成一句专业的打招呼消息（50字以内）：

职位：${jobInfo.jobName}
公司：${jobInfo.brandName}
薪资：${jobInfo.salaryDesc}

要求：
1. 简洁专业
2. 突出匹配度
3. 表达求职意向`;

  try {
    const response = await fetch(`${llmConfig.providerCompleteApiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llmConfig.providerApiSecret}`
      },
      body: JSON.stringify({
        model: llmConfig.model,
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 100,
        temperature: 0.7
      })
    });
    
    if (!response.ok) {
      throw new Error(`API 错误: ${response.status}`);
    }
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim();
    
  } catch (err) {
    console.warn('AI 生成失败:', err.message);
    return null;
  }
}
