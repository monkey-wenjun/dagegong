# BOSS 直聘选择器测试报告

## ✅ 已确认有效的选择器

### 1. 未读标签
```javascript
'#container > div > div > div.list-warp.v2 > div > div.label-list > ul > li:nth-child(2) > span'
```
- **文本**: "未读(2)"
- **状态**: 可点击 ✅

### 2. 搜索框
```javascript
'#container > div > div > div.list-warp.v2 > div > div.boss-search-top > div > input'
```
- **类型**: INPUT
- **类名**: boss-search-input
- **占位符**: "搜索30天内的联系人"
- **状态**: 可输入 ✅

### 3. 对话列表项（需要进一步确认）
找到的 2 个都是 `filter-item`，不是真正的对话项。

## 建议的发送流程

```javascript
// 步骤 1：点击未读标签
await page.click('#container > div > div > div.list-warp.v2 > div > div.label-list > ul > li:nth-child(2) > span')
await sleep(1500)

// 步骤 2：在搜索框输入 BOSS ID
await page.click('#container > div > div > div.list-warp.v2 > div > div.boss-search-top > div > input')
await page.type('#container > div > div > div.list-warp.v2 > div > div.boss-search-top > div > input', bossId.slice(0, 10))
await sleep(2000)

// 步骤 3：点击搜索结果（第一个对话项）
// 需要找到真正的对话项选择器，可能是：
// - '.chat-list .chat-item'
// - '.friend-list .friend-item'
// - 或其他
```

## 下一步

需要确认真正的对话列表项选择器，然后就可以更新主逻辑了。
