const sqlite3 = require('better-sqlite3');
const db = sqlite3('C:\\Users\\hswei\\.dagegong\\storage\\public.db');

console.log('========== 模拟 Worker 查询 ==========\n');

const encryptUserId = 'b254a0666c35e77d1nF93tW6GA~~';

// 1. 测试有 encryptUserId 的查询
console.log('1. 带 encryptUserId 的查询:');
console.log(`   用户ID: ${encryptUserId}`);

const dataQuery = `
  SELECT encryptBossId, bossName, lastText, lastIsSelf, unreadCount, updateTime, encryptUserId
  FROM v_boss_chat_relation
  WHERE encryptUserId = ?
  ORDER BY updateTime DESC
  LIMIT ? OFFSET ?
`;

const dataParams = [encryptUserId, 100, 0];
const result1 = db.prepare(dataQuery).all(...dataParams);
console.log(`   返回记录数: ${result1.length}`);

if (result1.length > 0) {
  console.log('\n   前3条记录:');
  result1.slice(0, 3).forEach((r, i) => {
    console.log(`   [${i+1}] ${r.bossName} | unread: ${r.unreadCount} | lastIsSelf: ${r.lastIsSelf}`);
  });
  
  // 检查未读消息
  const unread = result1.filter(r => r.unreadCount > 0);
  console.log(`\n   未读消息数: ${unread.length}`);
  unread.forEach(r => {
    console.log(`   - ${r.bossName}: ${r.lastText?.substring(0, 30)}`);
  });
} else {
  console.log('   无记录！检查 encryptUserId 是否匹配...');
  
  // 检查实际的 encryptUserId
  const sample = db.prepare('SELECT DISTINCT encryptUserId FROM v_boss_chat_relation LIMIT 3').all();
  console.log('\n   数据库中的用户ID:');
  sample.forEach(s => {
    console.log(`   - ${s.encryptUserId}`);
    console.log(`   - 匹配: ${s.encryptUserId === encryptUserId}`);
  });
}

// 2. 测试不带 encryptUserId 的查询
console.log('\n2. 不带 encryptUserId 的查询 (前3条):');
const result2 = db.prepare('SELECT encryptBossId, bossName, unreadCount, encryptUserId FROM v_boss_chat_relation ORDER BY updateTime DESC LIMIT 3').all();
result2.forEach((r, i) => {
  console.log(`   [${i+1}] ${r.bossName} | unread: ${r.unreadCount} | 用户ID: ${r.encryptUserId?.substring(0, 20)}...`);
});

console.log('\n========== 完成 ==========');
