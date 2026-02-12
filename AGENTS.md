# Gemini Batch Image Downloader Project Context

## Project Overview
这是一个 Chrome 浏览器插件，用于批量下载 Google Gemini 对话中生成的图片。
它解决了手动一张张点击下载全尺寸图片的繁琐问题。

## Tech Stack
- **Runtime**: Chrome Extension Manifest V3
- **Build**: Vite 6.4 + @crxjs/vite-plugin 2.3
- **UI Framework**: In-page Shadow DOM UI + TypeScript 5.9
- **Package Manager**: pnpm

## Core Features
1. **Content Script**: 自动检测 Gemini 页面 (`gemini.google.com`) 中的生成图片 (`gg-dl` 路径)。
2. **In-page Panel UI**: 点击扩展图标后在页面内拉起暗色面板，支持全选/反选。
3. **Batch Download**: 通过 Background Service Worker 调用 `chrome.downloads` API 批量下载全尺寸原图 (`=s0`)。

## Key Implementation Details
- **Cookie Handling**: 利用 `chrome.downloads.download()` 自动携带浏览器 Cookie 的特性，无需手动处理鉴权。
- **Image URL**: Gemini 生成图 URL 含有 `gg-dl`，默认参数 `=s1024-rj` (压缩)，插件自动替换为 `=s0` (原始无损)。
- **Communication**: Action Click -> Content Script (开关面板)，Content Script -> Background (触发下载)。

## Development Workflow
1. **Install**: `pnpm install`
2. **Dev**: `pnpm dev` (HMR supported)
3. **Build**: `pnpm build` -> output to `dist/`
4. **Load**: Load `dist/` folder in `chrome://extensions` (Developer Mode)

## Project Rules
- 使用 `pnpm` 管理依赖。
- 保持 Manifest V3 兼容性。
- UI 风格需保持与 Gemini 一致的暗色主题。
