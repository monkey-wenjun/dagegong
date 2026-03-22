# BOSS 直聘页面结构手动检查指南

由于反爬机制，无法通过自动化获取页面结构。请手动检查并告诉我：

## 方法：使用浏览器开发者工具

### 1. 检查输入框
1. 打开 BOSS 直聘网页版（www.zhipin.com）
2. 进入任意聊天窗口
3. **右键点击输入框** → **检查元素**
4. 查看右侧的 HTML 代码，找到输入框的 `class` 或 `id`

**常见的输入框结构（参考）：**
```html
<!-- 可能是这样 -->
<div class="editor-component">
  <div class="input-area" contenteditable="true"></div>
</div>

<!-- 或者这样 -->
<div class="chat-editor" contenteditable="true"></div>

<!-- 或者这样 -->
<textarea class="message-input"></textarea>
```

**请告诉我：**
- 输入框的 `class` 是什么？（例如：`editor-component input-area`）
- 是否有 `contenteditable="true"` 属性？
- 标签名是什么？（`div`、`textarea`、`input`？）

---

### 2. 检查发送按钮
1. 在聊天窗口中输入任意文字
2. **右键点击"发送"按钮** → **检查元素**
3. 查看按钮的 `class` 或 `id`

**常见的发送按钮结构（参考）：**
```html
<!-- 可能是这样 -->
<button class="send-btn">发送</button>

<!-- 或者这样 -->
<div class="btn-send">发送</div>

<!-- 或者这样 -->
<button class="ui-btn btn-send-primary">发送</button>
```

**请告诉我：**
- 发送按钮的 `class` 是什么？（例如：`send-btn`）
- 按钮文本是什么？（`发送`、`Send`？）
- 标签名是什么？（`button`、`div`、`a`？）

---

### 3. 检查对话列表（左侧）
1. 查看左侧的对话列表
2. **右键点击任意一个 BOSS 对话** → **检查元素**

**请告诉我：**
- 对话项的 `class` 是什么？（例如：`friend-item`、`chat-item`？）
- 是否有 `data-boss-id` 或类似的属性？

---

## 快速反馈格式

复制以下格式，填入你看到的值：

```
输入框：
  - class: 
  - 标签: 
  - contenteditable: 

发送按钮：
  - class: 
  - 标签: 
  - 文本: 

对话列表项：
  - class: 
  - boss ID 属性: 
```

---

## 如果无法打开开发者工具

BOSS 直聘可能限制了 F12。可以尝试：
1. **Ctrl+Shift+J** 打开控制台
2. **Ctrl+Shift+C** 开启元素选择模式，然后点击输入框
3. 或者在地址栏输入 `view-source:https://www.zhipin.com/web/geek/chat` 查看源码

如果都不行，请截图告诉我输入框和发送按钮的位置，我根据常见的 BOSS 直聘结构来推测选择器。
