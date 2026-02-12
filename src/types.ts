export interface PreviewRect {
    x: number;
    y: number;
    width: number;
    height: number;
    dpr: number;
}

export interface ImageInfo {
    id: number;
    thumbnailUrl: string;
    fullSizeUrl: string;
    selected: boolean;
    previewRect?: PreviewRect;
}

export type MessageType =
    | { type: 'TOGGLE_PANEL' }
    | { type: 'OPEN_PANEL' }
    | { type: 'DOWNLOAD_IMAGES'; images: ImageInfo[]; prefix: string }
    | { type: 'DOWNLOAD_PROGRESS'; completed: number; total: number; error?: string }
    | { type: 'DOWNLOAD_COMPLETE'; succeeded: number; failed: number };
