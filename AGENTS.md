# Gemini Batch Image Downloader Project Context

## Project Overview
This is a Chrome extension for batch-downloading full-resolution images generated in Google Gemini conversations.
The UI is rendered as an in-page Shadow DOM panel on Gemini pages, not in a popup page.

## Tech Stack
- Runtime: Chrome Extension Manifest V3
- Build: Vite 6.4 + `@crxjs/vite-plugin` 2.3
- Language: TypeScript 5.9
- Package Manager: pnpm

## Core Features
1. Image detection: scan and detect Gemini-generated images on `gemini.google.com`
2. In-page panel: click extension icon to toggle panel, with select all / unselect all and filename prefix input
3. Batch download: call `chrome.downloads.download()` from background to fetch original images
4. Progress updates: background broadcasts progress, content script updates UI in real time

## Communication
- Action Click -> Background -> Content Script (`TOGGLE_PANEL` / `OPEN_PANEL`)
- Content Script -> Background (`DOWNLOAD_IMAGES`)
- Background -> Content Script (`DOWNLOAD_PROGRESS`)

## Key Implementation Notes
- Download URLs are normalized toward `=s0` to fetch full-resolution originals
- `chrome.downloads` reuses browser cookies, avoiding custom auth handling
- Scan logic skips the extension's own Shadow DOM to avoid self-scanning

## Development Workflow
1. Install: `pnpm install`
2. Dev: `pnpm dev`
3. Build: `pnpm build`
4. Load: load `dist/` in `chrome://extensions`

## Project Rules
- Use `pnpm`
- Keep Manifest V3 compatible
- Keep the panel dark-themed and visually aligned with Gemini
