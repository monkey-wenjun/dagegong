import cityGroupData from '../packages/geek-auto-start-chat-with-boss/cityGroup.mjs'

// 查找杭州
const hangzhouGroup = cityGroupData.zpData.cityGroup.find(g => g.firstChar === 'H')
const hangzhou = hangzhouGroup?.cityList.find(c => c.name === '杭州')

console.log('=== 杭州区域数据验证 ===')
console.log('城市名称:', hangzhou?.name)
console.log('区域数量:', hangzhou?.subLevelModelList?.length || 0)

if (hangzhou?.subLevelModelList) {
  console.log('\n前10个区域:')
  hangzhou.subLevelModelList.slice(0, 10).forEach((d, i) => {
    console.log(`  ${i + 1}. ${d.name} (code: ${d.code})`)
  })
}

// 统计有多少城市有区域数据
let cityCount = 0
let districtCount = 0
for (const group of cityGroupData.zpData.cityGroup) {
  for (const city of group.cityList) {
    if (city.subLevelModelList && city.subLevelModelList.length > 0) {
      cityCount++
      districtCount += city.subLevelModelList.length
    }
  }
}

console.log('\n=== 整体统计 ===')
console.log('有区域数据的城市数:', cityCount)
console.log('区域总数:', districtCount)
console.log('平均每城市区域数:', (districtCount / cityCount).toFixed(1))
