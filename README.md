# Gemini Batch Image Downloader

English documentation. For Chinese users, see [README.zh-CN.md](README.zh-CN.md).

A Chrome extension for Google Gemini that opens an in-page panel when you click the extension icon, then lets you batch-download full-resolution generated images from the current conversation.

## Features

- In-page Shadow DOM panel (no popup page)
- Automatic Gemini image detection with select all / unselect all
- Batch download of full-resolution originals (`=s0` URL conversion)
- Real-time download progress and result feedback
- Uses `chrome.downloads` so browser authentication cookies are reused

## How It Works

1. Click the extension action icon (`chrome.action`)
2. Background sends `TOGGLE_PANEL` / `OPEN_PANEL` to the Gemini tab
3. Content script scans page images and renders the panel
4. Content script sends `DOWNLOAD_IMAGES` to background
5. Background calls `chrome.downloads.download()` and broadcasts progress

## Tech Stack

- Chrome Extension Manifest V3
- TypeScript 5.9
- Vite 6.4 + `@crxjs/vite-plugin` 2.3
- pnpm

## Project Structure

```text
src/
  background/index.ts   # Action click handling + batch downloads
  content/index.ts      # Image scanning + in-page panel UI
  types.ts              # Shared message/data types
public/icons/           # Extension icons
docs/development-guide.md
manifest.json
```

## Local Development

```bash
pnpm install
pnpm dev
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked"
4. Select the `dist/` directory

## Build

```bash
pnpm build
```

Build output is generated in `dist/`.

## Usage

1. Open `https://gemini.google.com/`
2. Open a conversation with generated images
3. Click the extension icon
4. Use the panel in the top-right corner to choose images and download

## Troubleshooting

### Panel does not appear after clicking the icon

- Refresh the Gemini page and try again (content script needs injection on the latest page state)
- Make sure you loaded the latest `dist/`

### No images are detected

- Confirm the conversation already has rendered generated images
- Scroll to trigger lazy loading, then try again

### Downloads fail

- Check Gemini login status
- Check extension Errors / Service Worker logs in `chrome://extensions`

## Permissions

- `activeTab`: interact with the active tab via extension action flow
- `downloads`: call Chrome downloads API
- `host_permissions: https://gemini.google.com/*`: inject content script and interact with Gemini page
