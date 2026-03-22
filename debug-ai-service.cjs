const sqlite3 = require('better-sqlite3');
const db = sqlite3('C:\\Users\\hswei\\.dagegong\\storage\\public.db');

console.log('========== 模拟完整 AI 服务逻辑 ==========\n');

// 模拟 getCurrentUserId 的行为
const result1 = db.prepare('SELECT encryptUserId FROM v_boss_chat_relation ORDER BY updateTime DESC LIMIT 1').get();
const currentUserId = result1?.encryptUserId;
console.log('[AiAutoReply] 当前用户ID:', currentUserId);

// 模拟带用户ID的查询
console.log('\n[AiAutoReply] 查询当前用户对话...');
const query = `
  SELECT encryptBossId, bossName, lastText, lastIsSelf, unreadCount, updateTime, encryptJobId, jobName
  FROM v_boss_chat_relation
  WHERE encryptUserId = ?
  ORDER BY updateTime DESC
  LIMIT ? OFFSET ?
`;
const conversations = db.prepare(query).all(currentUserId, 100, 0);
console.log(`[AiAutoReply] 当前用户对话数: ${conversations.length}`);

if (conversations.length === 0) {
  console.log('[AiAutoReply] 数据库返回0条对话！');
  console.log('\n可能原因:');
  console.log('  1. encryptUserId 不匹配');
  console.log('  2. 视图没有数据');
  
  // 检查实际的 encryptUserId
  const sample = db.prepare('SELECT DISTINCT encryptUserId FROM v_boss_chat_relation LIMIT 3').all();
  console.log('\n  数据库中的用户ID:');
  sample.forEach(s => {
    const match = s.encryptUserId === currentUserId;
    console.log(`    ${s.encryptUserId} ${match ? '(匹配)' : '(不匹配)'}`);
  });
} else {
  console.log(`[AiAutoReply] 原始数据前3条:`);
  conversations.slice(0, 3).forEach((c, i) => {
    console.log(`  [${i+1}] ${c.bossName}, unread: ${c.unreadCount}, lastIsSelf: ${c.lastIsSelf}`);
  });

  // 模拟7天过滤
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  console.log(`\n[AiAutoReply] 7天前时间戳: ${sevenDaysAgo}`);
  
  const recentConversations = conversations.filter(conv => {
    const updateTime = conv.updateTime > 1000000000000 ? conv.updateTime : conv.updateTime * 1000;
    const isRecent = updateTime > sevenDaysAgo;
    if (conv.bossName === '林先生') {
      console.log(`  林先生: updateTime=${conv.updateTime}, 转换后=${updateTime}, 是否最近=${isRecent}`);
    }
    return isRecent;
  });
  
  console.log(`[AiAutoReply] 7天内对话数: ${recentConversations.length}`);
  
  // 模拟需要回复的过滤
  console.log('\n[AiAutoReply] 所有对话详情:');
  recentConversations.slice(0, 10).forEach((conv, i) => {
    const lastIsSelfValue = conv.lastIsSelf;
    const isLastFromSelf = lastIsSelfValue === true || lastIsSelfValue === 1;
    const needReply = conv.unreadCount > 0 && !isLastFromSelf;
    console.log(`  [${i+1}] ${conv.bossName} | unread: ${conv.unreadCount} | lastIsSelf: ${lastIsSelfValue} | needReply: ${needReply}`);
  });
  
  const needReply = recentConversations.filter(conv => {
    const isLastFromSelf = conv.lastIsSelf === true || conv.lastIsSelf === 1;
    if (conv.unreadCount > 0 && !isLastFromSelf) return true;
    if (!isLastFromSelf && conv.lastText) return true;
    return false;
  });
  
  console.log(`\n[AiAutoReply] 需要回复的对话数: ${needReply.length}`);
  needReply.forEach(n => {
    console.log(`  - ${n.bossName}: ${n.lastText?.substring(0, 30)}`);
  });
}

console.log('\n========== 完成 ==========');
