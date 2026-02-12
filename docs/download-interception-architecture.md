# 原图下载拦截方案：技术架构与决策记录

## 1. 问题背景

### 1.1 核心目标

从 Google Gemini 页面批量下载 AI 生成的**原始全尺寸图片**（PNG，通常 ~7MB），而非页面上显示的缩略图（JPEG，1024px）。

### 1.2 Gemini 图片 URL 体系

Gemini 页面中存在两套完全不同的图片 URL：

| 类型 | URL 路径 | 用途 | 示例 |
|------|---------|------|------|
| 显示 URL | `/gg/AMW1TP...` | 页面内展示缩略图 | `lh3.googleusercontent.com/gg/AMW1TP...=s1024-rj` |
| 下载 URL | `/gg-dl/AOI_d_...` | 原生下载按钮触发的签名 URL | `lh3.googleusercontent.com/gg-dl/AOI_d_...=s0-d-I` |

**关键发现：显示 URL 和下载 URL 使用完全不同的 token。** 对显示 URL 做任何后缀改写（如 `=s0`）都无法获取原图。

### 1.3 被否定的方案：URL 后缀改写

最初尝试将显示 URL 的 `=s1024-rj` 后缀改写为 `=s0`，期望获取全尺寸图片。

**失败原因：**
- 显示 URL (`/gg/AMW1TP...`) 和下载 URL (`/gg-dl/AOI_d_...`) 是完全不同的签名 token
- `=s0` 只是告诉 CDN "不限制尺寸"，但 token 本身决定了能否访问原始文件
- 显示 token 只能返回 JPEG 格式的预览图，无论尺寸参数如何设置

## 2. Gemini 原生下载流程逆向分析

通过 Chrome DevTools 抓包分析，完整还原了 Gemini "Download full size" 按钮的下载链路：

### 2.1 流程概览

```
用户点击 "Download full size"
    │
    ▼
[1] POST /_/BardChatUi/data/batchexecute
    RPC: c8o8Fe
    请求体: 图片 token + 会话 ID + CSRF token
    │
    ▼
[2] 响应返回签名的 gg-dl URL
    https://lh3.googleusercontent.com/gg-dl/AOI_d_...=d-I?alr=yes
    │
    ▼
[3] GET gg-dl URL → 302 重定向
    → work.fife.usercontent.google.com/rd-gg-dl/...=s0-d-I?alr=yes
    （响应 content-type: text/plain，包含下一跳 URL）
    │
    ▼
[4] GET rd-gg-dl URL → 302 重定向
    → lh3.googleusercontent.com/rd-gg-dl/...=s0-d-I?alr=yes
    （响应 content-type: text/plain，包含最终 URL）
    │
    ▼
[5] GET 最终 URL → image/png (~7MB)
    原始全尺寸 PNG 图片
    │
    ▼
[6] 页面 JS 创建 blob: URL → <a download>.click() → 触发浏览器下载
```

### 2.2 RPC 请求格式 (c8o8Fe)

```
POST /_/BardChatUi/data/batchexecute

请求体:
f.req=[[["c8o8Fe", INNER_JSON, null, "generic"]]]
&at=CSRF_TOKEN    // 来自 WIZ_global_data.SNlM0e

INNER_JSON 包含:
- 图片 token (如 "$AedXnj...")    // 从 Angular 组件内存中持有
- 内容类型 URL
- 提示词文本
- 响应/会话 ID (r_xxx, rc_xxx, c_xxx)
- 会话级 token
```

### 2.3 为什么不能直接构造 RPC 请求

- **图片 token 不可获取**：token（如 `$AedXnj...`）存储在 Angular 组件的内存中，生产模式下 Angular 不暴露 `ng.getComponent()` 等调试 API
- **会话参数复杂**：需要 CSRF token、会话 ID、响应 ID 等多个参数，且这些参数在不同会话间变化
- **维护成本高**：RPC 格式是内部协议，随时可能变更

## 3. 当前方案：拦截原生下载流程

### 3.1 核心思路

既然无法自行构造下载请求，那就**借用 Gemini 页面自身的下载逻辑** —— 触发原生下载按钮，让页面 JS 完成所有 RPC 和重定向工作，我们只在最后一步拦截已经 fetch 到的图片 blob。

### 3.2 架构图

```
┌─────────────────────────────────────────────────────────┐
│ Main World (页面 JS 上下文)                              │
│                                                         │
│  download-interceptor.js (通过 <script src> 注入)        │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 1. Patch window.fetch                           │    │
│  │    - 拦截 /gg-dl/ 和 /rd-gg-dl/ 的响应          │    │
│  │    - 当 content-type 为 image/* 时克隆 blob      │    │
│  │    - 转为 dataURL 通过 postMessage 发送          │    │
│  │                                                 │    │
│  │ 2. Patch HTMLAnchorElement.prototype.click       │    │
│  │    - 当 suppress 标志开启时，阻止 blob: 下载     │    │
│  │    - 防止原生下载弹窗干扰批量流程               │    │
│  └─────────────────────────────────────────────────┘    │
│           ▲ CustomEvent          │ postMessage          │
│           │ 'gbd-control'        ▼                      │
├───────────┼──────────────────────┼──────────────────────┤
│ Isolated World (Content Script)  │                      │
│                                  │                      │
│  src/content/index.ts            │                      │
│  ┌───────────────────────────────┼─────────────────┐    │
│  │ startDownload() 流程:         │                 │    │
│  │  1. 启用 suppress 标志        │                 │    │
│  │  2. 遍历选中图片:              │                 │    │
│  │     a. 通过 thumbnailUrl       │                 │    │
│  │        找到 DOM 中的 <img>     │                 │    │
│  │     b. 向上找 .overlay-container                │    │
│  │     c. 定位原生下载按钮        │                 │    │
│  │     d. button.click() 触发     │                 │    │
│  │     e. 等待 postMessage        ◄─── GBD_IMAGE   │    │
│  │        返回 dataUrl                 _CAPTURED   │    │
│  │     f. 发送到 Background       │                 │    │
│  │  3. 关闭 suppress 标志        │                 │    │
│  └─────────────────────────┬───────────────────────┘    │
│                            │ chrome.runtime             │
│                            │ .sendMessage               │
├────────────────────────────┼────────────────────────────┤
│ Service Worker (Background)▼                            │
│                                                         │
│  src/background/index.ts                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │ processAndDownload(dataUrl, filename):           │    │
│  │  1. dataUrl → blob                              │    │
│  │  2. removeWatermarkFromBlob(blob) 去水印         │    │
│  │  3. blob → processedDataUrl                     │    │
│  │  4. chrome.downloads.download() 保存文件         │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 3.3 关键文件

| 文件 | 运行环境 | 职责 |
|------|---------|------|
| `public/download-interceptor.js` | Main World | Patch fetch + 阻止原生下载 |
| `src/content/index.ts` | Isolated World | UI 面板 + 编排下载流程 |
| `src/background/index.ts` | Service Worker | 水印去除 + 文件保存 |

### 3.4 跨 World 通信机制

Content Script (Isolated World) 和 Interceptor (Main World) 之间不能直接调用函数，通过两个通道通信：

| 方向 | 机制 | 用途 |
|------|------|------|
| Content → Main | `window.postMessage({ type: 'GBD_SUPPRESS' })` | 控制 suppress 开关 |
| Main → Content | `window.postMessage({ type: 'GBD_IMAGE_CAPTURED' })` | 传回捕获的图片数据 |

双向均使用 `postMessage` 而非 `CustomEvent`，因为 Chrome 扩展的 isolated world 与 main world 有独立的 JS context，`CustomEvent.detail` 中的对象无法跨 world 传递（在接收端变为 `null`）。`postMessage` 的 data 会经过结构化克隆，可以正常跨 world 序列化。

## 4. DOM 结构与图片识别

### 4.1 Gemini 生成图 vs 用户参考图

```html
<!-- Gemini 生成的图片 (应下载) -->
<single-image class="generated-image large">
  <div class="overlay-container">
    <button class="image-button">
      <img src="https://lh3...googleusercontent.com/gg/AMW1TP...=s1024-rj">
    </button>
    <div class="generated-image-controls">
      <download-generated-image-button>
        <button data-test-id="download-generated-image-button"
                aria-label="Download full size image">
        </button>
      </download-generated-image-button>
    </div>
  </div>
</single-image>

<!-- 用户上传的参考图 (应排除) -->
<user-query-file-carousel>
  <user-query-file-preview>
    <button class="preview-image-button">
      <img src="https://lh3...googleusercontent.com/gg/AMW1TP...">
    </button>
  </user-query-file-preview>
</user-query-file-carousel>
```

### 4.2 识别规则

1. **排除**：位于 `user-query-file-preview` 或 `user-query-file-carousel` 内的图片（用户上传的参考图）
2. **包含**：位于 `button.image-button` 或 `.overlay-container` 内的图片
3. **包含**：URL 匹配 `/gg/`、`/gg-dl/`、`/rd-gg/`、`/aip-dl/` 路径模式
4. **备选**：附近有 "Download full size image" 按钮且图片尺寸 >= 120px

### 4.3 下载按钮定位

从 `<img>` 元素出发定位对应的原生下载按钮：

```
<img> → closest('.overlay-container') → querySelector('button[data-test-id="download-generated-image-button"]')
```

## 5. 已知限制与风险

### 5.1 `button.click()` 与 `isTrusted`

当前使用 `button.click()` 触发原生下载按钮。该方法产生的事件 `isTrusted` 为 `false`。

**现状**：经实测，Gemini 目前不校验 `isTrusted`，下载流程正常触发。

**风险**：Google 未来可能添加 `isTrusted` 检查，届时需要改用其他方案：
- 方案 A：通过 `chrome.debugger` API 发送 trusted input event（需额外权限）
- 方案 B：在 main world 中 hook Angular 的下载服务，直接调用内部 RPC 函数
- 方案 C：提取页面中的 CSRF token 和 session 参数，自行构造 `c8o8Fe` RPC 请求

### 5.2 数据传输大小

原始图片 ~7MB，转为 base64 dataURL 后约 ~9.3MB。通过 `postMessage` 和 `chrome.runtime.sendMessage` 传输大 dataURL 可能在极端情况下出现性能问题。

**缓解措施**：逐张下载（非并发），每张处理完毕后再处理下一张。

### 5.3 页面结构依赖

方案依赖以下 DOM 结构和选择器，Gemini 前端更新后可能需要适配：
- `.overlay-container` 容器
- `button[data-test-id="download-generated-image-button"]` 下载按钮
- `user-query-file-preview` / `user-query-file-carousel` 用户参考图容器
- `single-image.generated-image` 生成图容器

### 5.4 Fetch Patch 的兼容性

拦截器 patch 了 `window.fetch`，需要在页面自身的 JS 加载前注入。当前通过 content script 在 `document_start`（或尽早）注入 `<script src>` 标签实现。如果页面有 Service Worker 缓存了 fetch 请求，可能绕过我们的 patch。

## 6. 方案对比总结

| 方案 | 优点 | 缺点 | 状态 |
|------|------|------|------|
| URL 后缀改写 (`=s0`) | 实现简单 | **无法获取原图**（token 不同） | 已否定 |
| 自行构造 RPC 请求 | 不依赖 UI 交互 | 图片 token 无法从 DOM 获取；协议易变 | 未采用 |
| 拦截原生下载流程 | 复用页面已有逻辑；获取真正的原图 | 依赖 DOM 结构；`isTrusted` 风险 | **当前方案** |
