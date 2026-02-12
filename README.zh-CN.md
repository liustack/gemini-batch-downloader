# Gemini 批量图片下载器

中文文档。英文文档请见 [README.md](README.md)。

这是一个用于 Google Gemini 的 Chrome 扩展：点击扩展图标后，会在页面内直接拉起面板，支持批量下载当前对话中的生成图片原图。

## 功能特性

- 页面内 Shadow DOM 面板（不依赖 popup）
- 自动检测 Gemini 生成图片并支持全选/反选
- 批量下载原图（自动将 URL 尺寸参数转为 `=s0`）
- 下载进度与结果反馈
- 通过 `chrome.downloads` 发起下载，复用浏览器鉴权 Cookie

## 工作原理

1. 点击扩展图标（`chrome.action`）
2. Background 向当前 Gemini 页面发送 `TOGGLE_PANEL` / `OPEN_PANEL`
3. Content Script 扫描页面图片并渲染面板
4. Content Script 发送 `DOWNLOAD_IMAGES` 给 Background
5. Background 调用 `chrome.downloads.download()` 批量下载，并广播进度

## 技术栈

- Chrome Extension Manifest V3
- TypeScript 5.9
- Vite 6.4 + `@crxjs/vite-plugin` 2.3
- pnpm

## 项目结构

```text
src/
  background/index.ts   # action 点击处理 + 批量下载
  content/index.ts      # 图片扫描 + 页内面板 UI
  types.ts              # 消息与数据类型
public/icons/           # 扩展图标
docs/development-guide.md
manifest.json
```

## 本地开发

```bash
pnpm install
pnpm dev
```

然后在 Chrome 中：

1. 打开 `chrome://extensions`
2. 开启开发者模式
3. 点击“加载已解压的扩展程序”
4. 选择 `dist/` 目录

## 构建

```bash
pnpm build
```

构建产物输出到 `dist/`。

## 使用方式

1. 打开 `https://gemini.google.com/`
2. 进入包含生成图片的对话
3. 点击扩展图标
4. 在页面右上角面板中选择图片并下载

## 常见问题

### 点击图标没有弹出面板

- 刷新 Gemini 页面后重试（content script 需要注入到最新页面）
- 确认加载的是最新 `dist/`

### 检测不到图片

- 确认当前对话中已有已渲染完成的图片
- 向下滚动触发懒加载后再点图标

### 下载失败

- 确认 Gemini 登录状态正常
- 查看 `chrome://extensions` 中该扩展的 Errors / Service Worker 日志

## 权限说明

- `activeTab`：处理当前活动标签页并进行 action 交互
- `downloads`：调用 Chrome 下载 API
- `host_permissions: https://gemini.google.com/*`：注入内容脚本并与页面交互
