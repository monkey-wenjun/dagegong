/**
 * 测试 Worker 返回的数据结构
 * 这个脚本模拟 Worker 的查询逻辑，检查返回数据的类型
 */
const sqlite3 = require('better-sqlite3');
const db = sqlite3('C:\\Users\\hswei\\.dagegong\\storage\\public.db');

console.log('========== 测试 Worker 查询数据结构 ==========\n');

const encryptUserId = 'b254a0666c35e77d1nF93tW6GA~~';

// 模拟 Worker 的 SQL 查询
const dataQuery = `
  SELECT * FROM v_boss_chat_relation
  WHERE encryptUserId = ?
  ORDER BY updateTime DESC
  LIMIT ? OFFSET ?
`;

const rawData = db.prepare(dataQuery).all(encryptUserId, 100, 0);

console.log(`返回记录数: ${rawData.length}`);
console.log('\n第一条记录的字段类型:');
const first = rawData[0];
for (const [key, value] of Object.entries(first)) {
  console.log(`  ${key}: ${typeof value} = ${value?.toString()?.substring(0, 50)}`);
}

// 查找林先生的记录
console.log('\n林先生的记录:');
const linRecord = rawData.find(r => r.bossName === '林先生');
if (linRecord) {
  console.log('  原始数据:', JSON.stringify(linRecord, null, 2));
  
  console.log('\n  关键字段类型:');
  console.log(`    unreadCount: ${typeof linRecord.unreadCount} = ${linRecord.unreadCount}`);
  console.log(`    lastIsSelf: ${typeof linRecord.lastIsSelf} = ${linRecord.lastIsSelf}`);
  console.log(`    updateTime: ${typeof linRecord.updateTime} = ${linRecord.updateTime}`);
  
  // 模拟 AI 服务的判断逻辑
  const lastIsSelfValue = linRecord.lastIsSelf;
  const isLastFromSelf = lastIsSelfValue === true || lastIsSelfValue === 1;
  const needReply = linRecord.unreadCount > 0 && !isLastFromSelf;
  
  console.log('\n  AI 服务判断逻辑:');
  console.log(`    lastIsSelfValue = ${lastIsSelfValue}`);
  console.log(`    lastIsSelfValue === true: ${lastIsSelfValue === true}`);
  console.log(`    lastIsSelfValue === 1: ${lastIsSelfValue === 1}`);
  console.log(`    isLastFromSelf = ${isLastFromSelf}`);
  console.log(`    unreadCount > 0: ${linRecord.unreadCount > 0}`);
  console.log(`    needReply = ${needReply}`);
} else {
  console.log('  未找到林先生的记录！');
}

// 测试 JSON 序列化后的结果（模拟 Worker postMessage）
console.log('\n========== JSON 序列化后（模拟 Worker 通信）==========');
const serialized = JSON.stringify(rawData.filter(r => r.bossName === '林先生'));
const deserialized = JSON.parse(serialized);
const linAfter = deserialized[0];

console.log('序列化后林先生的记录:', JSON.stringify(linAfter, null, 2));
console.log('\n关键字段类型变化:');
console.log(`  lastIsSelf: ${typeof linAfter.lastIsSelf} = ${linAfter.lastIsSelf}`);
console.log(`  unreadCount: ${typeof linAfter.unreadCount} = ${linAfter.unreadCount}`);

// 再次测试判断逻辑
const lastIsSelfAfter = linAfter.lastIsSelf;
const isLastFromSelfAfter = lastIsSelfAfter === true || lastIsSelfAfter === 1;
console.log(`\n再次判断: lastIsSelf === true: ${lastIsSelfAfter === true}, === 1: ${lastIsSelfAfter === 1}`);
console.log(`isLastFromSelf = ${isLastFromSelfAfter}`);

console.log('\n========== 完成 ==========');
