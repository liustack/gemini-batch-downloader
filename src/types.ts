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
    | { type: 'DOWNLOAD_IMAGE'; dataUrl: string; filename: string };
