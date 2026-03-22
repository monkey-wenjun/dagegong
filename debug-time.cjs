const sqlite3 = require('better-sqlite3');
const db = sqlite3('C:\\Users\\hswei\\.dagegong\\storage\\public.db');

console.log('========== 检查 updateTime 字段 ==========\n');

// 获取林先生的记录
const result = db.prepare(`
  SELECT encryptBossId, bossName, updateTime, typeof(updateTime) as type
  FROM v_boss_chat_relation
  WHERE bossName = '林先生'
`).get();

console.log('林先生的记录:');
console.log(`  updateTime: ${result.updateTime}`);
console.log(`  类型: ${result.type}`);

// 测试时间转换
const updateTime = result.updateTime;
const asNumber = Number(updateTime);
console.log(`\n  转为数字: ${asNumber}`);

// 判断是秒还是毫秒
let date;
if (asNumber > 1000000000000) {
  date = new Date(asNumber);
  console.log(`  作为毫秒: ${date.toLocaleString()}`);
} else {
  date = new Date(asNumber * 1000);
  console.log(`  作为秒(*1000): ${date.toLocaleString()}`);
}

// 检查7天前的时间
const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
console.log(`\n  7天前: ${new Date(sevenDaysAgo).toLocaleString()}`);
console.log(`  当前时间戳: ${Date.now()}`);

// 测试过滤逻辑
const updateTimeMs = asNumber > 1000000000000 ? asNumber : asNumber * 1000;
console.log(`\n  转换后的时间戳: ${updateTimeMs}`);
console.log(`  是否 > 7天前: ${updateTimeMs > sevenDaysAgo}`);

// 检查所有记录的 updateTime 类型
console.log('\n========== 所有记录的 updateTime 类型 ==========');
const types = db.prepare(`
  SELECT DISTINCT typeof(updateTime) as type, COUNT(*) as count
  FROM v_boss_chat_relation
  GROUP BY typeof(updateTime)
`).all();
types.forEach(t => {
  console.log(`  类型: ${t.type}, 数量: ${t.count}`);
});
