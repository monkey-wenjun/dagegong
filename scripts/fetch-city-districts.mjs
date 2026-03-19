/**
 * 获取所有城市的区域数据并更新 cityGroup.mjs
 * 运行: node scripts/fetch-city-districts.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

// 导入现有城市数据
const cityDataPath = pathToFileURL(path.join(rootDir, 'packages/geek-auto-start-chat-with-boss/cityGroup.mjs')).href
const cityGroupData = (await import(cityDataPath)).default

// 从城市数据中提取所有城市列表
const allCities = []
for (const group of cityGroupData.zpData.cityGroup) {
  for (const city of group.cityList) {
    allCities.push({
      code: city.code,
      name: city.name,
      firstChar: group.firstChar
    })
  }
}

// 从热门城市列表提取
for (const city of cityGroupData.zpData.hotCityList) {
  if (city.code !== 100010000 && !allCities.find(c => c.code === city.code)) {
    allCities.push({
      code: city.code,
      name: city.name,
      firstChar: null
    })
  }
}

console.log(`Total cities to fetch: ${allCities.length}`)

// 获取区域数据的函数
async function fetchDistricts(cityCode) {
  try {
    const response = await fetch(`https://www.zhipin.com/wapi/zpgeek/businessDistrict.json?cityCode=${cityCode}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    })
    
    if (!response.ok) {
      console.error(`Failed to fetch city ${cityCode}: ${response.status}`)
      return null
    }
    
    const data = await response.json()
    
    if (data.code !== 0 || !data.zpData?.businessDistrict?.subLevelModelList) {
      console.error(`Invalid response for city ${cityCode}:`, data.message)
      return null
    }
    
    // 只保留区/县级数据，不包含商圈
    const districts = data.zpData.businessDistrict.subLevelModelList.map(d => ({
      code: d.code,
      name: d.name
    }))
    
    return districts
  } catch (error) {
    console.error(`Error fetching city ${cityCode}:`, error.message)
    return null
  }
}

// 添加延迟避免请求过快
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 主函数
async function main() {
  const cityDistrictMap = new Map()
  
  // 优先处理热门城市
  const hotCityNames = ['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '西安', '南京', '苏州', 
    '重庆', '郑州', '长沙', '天津', '厦门', '青岛', '大连', '宁波', '无锡', '佛山', 
    '东莞', '合肥', '济南', '福州', '昆明', '沈阳', '哈尔滨', '长春', '石家庄', '太原']
  
  const hotCities = allCities.filter(c => hotCityNames.includes(c.name))
  const otherCities = allCities.filter(c => !hotCityNames.includes(c.name))
  
  console.log(`Fetching ${hotCities.length} hot cities first...`)
  
  for (const city of hotCities) {
    console.log(`Fetching districts for ${city.name}...`)
    const districts = await fetchDistricts(city.code)
    if (districts && districts.length > 0) {
      cityDistrictMap.set(city.code, districts)
      console.log(`  ✓ Found ${districts.length} districts`)
    } else {
      console.log(`  ✗ No districts found`)
    }
    await sleep(300)
  }
  
  console.log(`\nFetching ${otherCities.length} other cities...`)
  
  let successCount = 0
  let failCount = 0
  
  for (let i = 0; i < otherCities.length; i++) {
    const city = otherCities[i]
    console.log(`[${i + 1}/${otherCities.length}] Fetching districts for ${city.name}...`)
    const districts = await fetchDistricts(city.code)
    if (districts && districts.length > 0) {
      cityDistrictMap.set(city.code, districts)
      successCount++
      console.log(`  ✓ Found ${districts.length} districts`)
    } else {
      failCount++
      console.log(`  ✗ No districts found`)
    }
    await sleep(200)
  }
  
  // 更新城市数据
  const updatedCityGroupData = JSON.parse(JSON.stringify(cityGroupData))
  
  for (const group of updatedCityGroupData.zpData.cityGroup) {
    for (const city of group.cityList) {
      if (cityDistrictMap.has(city.code)) {
        city.subLevelModelList = cityDistrictMap.get(city.code)
      }
    }
  }
  
  // 保存更新后的数据
  const outputPath = path.join(rootDir, 'packages/geek-auto-start-chat-with-boss/cityGroup.mjs')
  const outputContent = `export default ${JSON.stringify(updatedCityGroupData, null, 2)}`
  
  fs.writeFileSync(outputPath, outputContent, 'utf-8')
  console.log(`\n========================================`)
  console.log(`Updated city data saved to: ${outputPath}`)
  console.log(`Total cities with districts: ${cityDistrictMap.size}`)
  console.log(`Success: ${successCount}, Failed: ${failCount}`)
}

main().catch(console.error)
