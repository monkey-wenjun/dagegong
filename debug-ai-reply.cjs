const sqlite3 = require('better-sqlite3');
const db = sqlite3('C:\\Users\\hswei\\.dagegong\\storage\\public.db');

console.log('========== AI 自动回复诊断 ==========\n');

// 1. 查看所有用户
console.log('1. 数据库中的用户:');
const users = db.prepare('SELECT DISTINCT encryptUserId, COUNT(*) as count FROM boss_chat_relation GROUP BY encryptUserId').all();
users.forEach(u => {
  console.log(`   用户ID: ${u.encryptUserId}, 对话数: ${u.count}`);
});

// 2. 查看有未读消息的记录
console.log('\n2. 有未读消息的对话 (unreadCount > 0):');
const unreadList = db.prepare(`
  SELECT encryptBossId, bossName, lastText, lastIsSelf, unreadCount, updateTime, encryptUserId
  FROM boss_chat_relation 
  WHERE unreadCount > 0
  ORDER BY updateTime DESC
`).all();

if (unreadList.length === 0) {
  console.log('   没有未读消息');
} else {
  unreadList.forEach((r, i) => {
    // 修正时间转换：updateTime 是毫秒
    const updateTimeMs = r.updateTime > 1000000000000 ? r.updateTime : r.updateTime * 1000;
    const updateTimeStr = new Date(updateTimeMs).toLocaleString();
    console.log(`   [${i+1}] ${r.bossName}`);
    console.log(`       未读: ${r.unreadCount}, 最后是自己: ${r.lastIsSelf}`);
    console.log(`       最后消息: ${r.lastText?.substring(0, 30)}`);
    console.log(`       用户ID: ${r.encryptUserId?.substring(0, 20)}...`);
    console.log(`       时间: ${updateTimeStr}`);
  });
}

// 3. 模拟 AI 自动回复的查询逻辑
console.log('\n3. 模拟 AI 自动回复查询 (最近7天):');
const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
const recentConvs = db.prepare(`
  SELECT encryptBossId, bossName, lastText, lastIsSelf, unreadCount, updateTime, encryptUserId
  FROM boss_chat_relation 
  WHERE updateTime > ?
  ORDER BY updateTime DESC
`).all(Math.floor(sevenDaysAgo));  // 注意：updateTime 是毫秒，不用除1000

console.log(`   最近7天对话数: ${recentConvs.length}`);

// 4. 检查需要回复的对话（模拟 AI 服务的过滤逻辑）
console.log('\n4. 需要回复的对话 (unread>0 AND lastIsSelf=0):');
const needReply = recentConvs.filter(r => {
  const isLastFromSelf = r.lastIsSelf === 1 || r.lastIsSelf === true;
  return r.unreadCount > 0 && !isLastFromSelf;
});

if (needReply.length === 0) {
  console.log('   没有需要回复的对话');
  console.log('\n   可能原因:');
  console.log('   - lastIsSelf=1 (最后一条是自己发的)');
  console.log('   - unreadCount=0 (没有未读消息)');
  console.log('   - updateTime超过7天');
} else {
  needReply.forEach((r, i) => {
    console.log(`   [${i+1}] ${r.bossName}: ${r.lastText?.substring(0, 40)}`);
  });
}

// 5. 检查视图数据
console.log('\n5. 视图中 v_boss_chat_relation 的数据:');
const viewData = db.prepare(`
  SELECT encryptBossId, bossName, lastText, lastIsSelf, unreadCount, updateTime, encryptUserId
  FROM v_boss_chat_relation 
  WHERE unreadCount > 0
  ORDER BY updateTime DESC
  LIMIT 5
`).all();

if (viewData.length === 0) {
  console.log('   视图中没有未读消息');
} else {
  viewData.forEach((r, i) => {
    const timeMs = r.updateTime > 1000000000000 ? r.updateTime : r.updateTime * 1000;
    const timeStr = new Date(timeMs).toLocaleString();
    console.log(`   [${i+1}] ${r.bossName}: unread=${r.unreadCount}, lastIsSelf=${r.lastIsSelf}, time=${timeStr}`);
  });
}

// 6. 当前时间参考
console.log('\n6. 当前时间:');
console.log(`   ${new Date().toLocaleString()}`);
console.log(`   7天前: ${new Date(sevenDaysAgo).toLocaleString()}`);

console.log('\n========== 诊断完成 ==========');
