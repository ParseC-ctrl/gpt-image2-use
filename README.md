# Image2 对话助手

一个本地网页应用，用 React + TypeScript 构建前端，用 Express 做本机代理服务。应用支持自定义 API Key、Base URL、多图上传、多轮上下文、服务器本地会话保存、流式状态输出、Markdown 预览、复制消息、失败重发、图片悬浮文件名和点击放大预览。

## 启动

```bash
npm install
npm run dev
```

打开：

```text
http://127.0.0.1:5173
```

## 构建

```bash
npm run build
npm run preview
```

## 使用方式

1. 在左侧配置区输入 API Key，并按需修改 Base URL。
2. 按需设置全局对话模型、Image2 模型、尺寸、质量和输出格式。
3. 在输入框左侧点击上传按钮，或把图片拖进输入框，支持多图。
4. 直接用自然语言提出需求，也可以点击快捷指令填入常用提示。
5. 如果请求失败，错误消息里会出现 `重新发送`，无需重新输入。

## 项目结构

```text
src/client/          React + TypeScript 前端
src/client/components  前端组件
src/server/          Express API 与 OpenAI 代理
src/server/openai.ts OpenAI 兼容请求、SSE 解析、结果提取
storage/            本地服务器会话数据，已在 .gitignore 忽略
```

## 说明

- API Key 不写入项目文件，只保存在浏览器 localStorage。
- Base URL 默认是 `https://api.openai.com/v1`，也可以改成 OpenAI 兼容代理地址。
- `/api/chat-stream` 使用 Responses API 流式输出，并通过 `previous_response_id` 保持多轮上下文。
- `单次 Image2` 按钮也走 `/api/chat-stream`，并强制调用图像生成工具，因此可以继续衔接上下文修改上一张图。
- 发送后输入框和附件会立即清空。
- 当聊天区不在底部时，新输出不会强制把滚动位置拉到最下面。
- 对话数据会自动保存到服务器本地 `storage/conversation.json`，不会保存 API Key。
- favicon 可通过 `npm run favicon` 重新生成。
