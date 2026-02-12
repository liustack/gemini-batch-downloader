/**
 * Background Service Worker: 处理面板切换、图片下载（fetch + 去水印 + 保存）
 * Service Worker 拥有 host_permissions，可绕过 CORS 直接 fetch 图片。
 */

import { removeWatermarkFromBlob } from '../core/watermarkEngine.ts';

function isGeminiTab(tab: chrome.tabs.Tab): boolean {
    return typeof tab.url === 'string' && tab.url.startsWith('https://gemini.google.com/');
}

function sendPanelMessage(tabId: number, type: 'TOGGLE_PANEL' | 'OPEN_PANEL'): void {
    chrome.tabs.sendMessage(tabId, { type }, () => {
        if (chrome.runtime.lastError) {
            console.debug('[Gemini Batch Downloader] sendPanelMessage failed:', chrome.runtime.lastError.message);
        }
    });
}

chrome.action.onClicked.addListener((tab) => {
    if (tab.id && isGeminiTab(tab)) {
        sendPanelMessage(tab.id, 'TOGGLE_PANEL');
        return;
    }

    chrome.tabs.create({ url: 'https://gemini.google.com/' }, (createdTab) => {
        if (!createdTab?.id) {
            return;
        }

        const listener = (tabId: number, changeInfo: { status?: string }) => {
            if (tabId !== createdTab.id || changeInfo.status !== 'complete') {
                return;
            }

            chrome.tabs.onUpdated.removeListener(listener);
            sendPanelMessage(createdTab.id!, 'OPEN_PANEL');
        };

        chrome.tabs.onUpdated.addListener(listener);
    });
});

async function processAndDownload(dataUrl: string, filename: string): Promise<{ success: boolean; error?: string }> {
    // dataUrl 由 content script 从 Gemini 原生下载流程中拦截得到
    const response = await fetch(dataUrl);
    let blob = await response.blob();
    blob = await removeWatermarkFromBlob(blob);

    const processedDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });

    return new Promise((resolve) => {
        chrome.downloads.download(
            { url: processedDataUrl, filename, conflictAction: 'uniquify' },
            (downloadId) => {
                if (chrome.runtime.lastError) {
                    resolve({ success: false, error: chrome.runtime.lastError.message });
                    return;
                }

                const listener = (delta: chrome.downloads.DownloadDelta) => {
                    if (delta.id !== downloadId) return;

                    if (delta.state?.current === 'complete') {
                        chrome.downloads.onChanged.removeListener(listener);
                        resolve({ success: true });
                    } else if (delta.state?.current === 'interrupted') {
                        chrome.downloads.onChanged.removeListener(listener);
                        resolve({ success: false, error: delta.error?.current });
                    }
                };
                chrome.downloads.onChanged.addListener(listener);
            },
        );
    });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'DOWNLOAD_IMAGE') {
        const { dataUrl, filename } = message as {
            type: 'DOWNLOAD_IMAGE';
            dataUrl: string;
            filename: string;
        };

        processAndDownload(dataUrl, filename)
            .then(sendResponse)
            .catch((err) => sendResponse({ success: false, error: String(err) }));

        return true; // 异步 sendResponse
    }
});

console.log('[Gemini Batch Downloader] Background service worker loaded');
