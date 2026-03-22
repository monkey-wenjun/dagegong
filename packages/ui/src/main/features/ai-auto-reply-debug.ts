/**
 * AI 自动回复调试工具
 * 用于验证数据库查询是否正常
 */

import { getPublicDbFilePath } from '@dagegong/geek-auto-start-chat-with-boss/runtime-file-utils.mjs'
import { initDb } from '@dagegong/sqlite-plugin'
import { BossChatRelation } from '@dagegong/sqlite-plugin/dist/entity/BossChatRelation.js'
import { VBossChatRelation } from '@dagegong/sqlite-plugin/dist/entity/VBossChatRelation.js'

const dbInitPromise = initDb(getPublicDbFilePath())

export async function debugQueryBossChatRelation() {
  console.log('========== AI 自动回复数据库调试 ==========')
  
  try {
    const ds = await dbInitPromise
    
    // 1. 查询 BossChatRelation 表（原始表）
    console.log('\n1. 查询 BossChatRelation 表（前5条）:')
    const rawRepo = ds.getRepository(BossChatRelation)
    const rawData = await rawRepo.find({ take: 5 })
    console.log(`   返回 ${rawData.length} 条记录`)
    rawData.forEach((item, i) => {
      console.log(`   [${i+1}] ${item.bossName} | unread: ${item.unreadCount} | lastIsSelf: ${item.lastIsSelf} | lastText: ${item.lastText?.slice(0, 30)}`)
    })
    
    // 2. 查询 VBossChatRelation 视图
    console.log('\n2. 查询 VBossChatRelation 视图（前5条）:')
    const viewRepo = ds.getRepository(VBossChatRelation)
    const viewData = await viewRepo.find({ take: 5 })
    console.log(`   返回 ${viewData.length} 条记录`)
    viewData.forEach((item, i) => {
      console.log(`   [${i+1}] ${item.bossName} | unread: ${item.unreadCount} | lastIsSelf: ${(item as any).lastIsSelf} | lastText: ${item.lastText?.slice(0, 30)}`)
    })
    
    // 3. 获取所有不同的 encryptUserId
    console.log('\n3. 所有用户ID:')
    const userIds = await rawRepo.createQueryBuilder()
      .select('DISTINCT encryptUserId')
      .getRawMany()
    console.log(`   找到 ${userIds.length} 个用户:`, userIds.map((u: any) => u.encryptUserId?.slice(0, 20) + '...'))
    
    // 4. 查询有未读消息且 lastIsSelf=false 的记录
    console.log('\n4. 需要回复的对话（unread>0 且 lastIsSelf=false）:')
    const needReplyRaw = await rawRepo.find({
      where: {
        unreadCount: MoreThan(0),
        lastIsSelf: false
      },
      take: 10
    })
    console.log(`   原始表返回 ${needReplyRaw.length} 条`)
    
    // 5. 检查视图字段
    console.log('\n5. 检查视图字段:')
    if (viewData.length > 0) {
      const first = viewData[0] as any
      console.log(`   视图字段列表:`, Object.keys(first))
      console.log(`   lastIsSelf 值: ${first.lastIsSelf}, 类型: ${typeof first.lastIsSelf}`)
    }
    
    console.log('\n========== 调试完成 ==========')
    
    return {
      rawCount: rawData.length,
      viewCount: viewData.length,
      userIds: userIds.map((u: any) => u.encryptUserId),
      needReplyCount: needReplyRaw.length,
      viewFields: viewData.length > 0 ? Object.keys(viewData[0] as any) : []
    }
  } catch (error) {
    console.error('调试出错:', error)
    throw error
  }
}

// 导入 MoreThan
import { MoreThan } from 'typeorm'
