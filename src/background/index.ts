import type { ImageInfo } from '../types';

/**
 * Background Service Worker: 处理批量下载请求
 * 使用 chrome.downloads.download() —— 浏览器下载管理器自动携带 Cookie。
 * 点击扩展图标时，直接在 Gemini 页内开关面板（无 popup）。
 */

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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'DOWNLOAD_IMAGES') {
        const { images, prefix } = message as {
            type: 'DOWNLOAD_IMAGES';
            images: ImageInfo[];
            prefix: string;
        };
        downloadAll(images, prefix).then(sendResponse);
        return true; // 异步 sendResponse
    }
});

async function downloadAll(
    images: ImageInfo[],
    prefix: string
): Promise<{ type: string; succeeded: number; failed: number }> {
    let succeeded = 0;
    let failed = 0;
    const total = images.length;

    for (let i = 0; i < total; i++) {
        const image = images[i];
        const filename = `${prefix}_${String(i + 1).padStart(2, '0')}.png`;

        try {
            await new Promise<void>((resolve, reject) => {
                chrome.downloads.download(
                    {
                        url: image.fullSizeUrl,
                        filename,
                        conflictAction: 'uniquify',
                    },
                    (downloadId) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                            return;
                        }

                        // 监听下载完成
                        const listener = (delta: chrome.downloads.DownloadDelta) => {
                            if (delta.id !== downloadId) return;

                            if (delta.state?.current === 'complete') {
                                chrome.downloads.onChanged.removeListener(listener);
                                resolve();
                            } else if (delta.state?.current === 'interrupted') {
                                chrome.downloads.onChanged.removeListener(listener);
                                reject(new Error(`Download interrupted: ${delta.error?.current}`));
                            }
                        };
                        chrome.downloads.onChanged.addListener(listener);
                    }
                );
            });
            succeeded++;
        } catch (err) {
            console.error(`Failed to download image ${i + 1}:`, err);
            failed++;
        }

        // 广播下载进度给页内面板（content script）
        try {
            chrome.runtime.sendMessage({
                type: 'DOWNLOAD_PROGRESS',
                completed: succeeded + failed,
                total,
            });
        } catch {
            // 页面面板可能不存在，忽略
        }
    }

    return { type: 'DOWNLOAD_COMPLETE', succeeded, failed };
}

console.log('[Gemini Batch Downloader] Background service worker loaded');
