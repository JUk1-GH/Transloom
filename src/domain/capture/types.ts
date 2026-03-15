import type { BoundingBox } from '@/domain/ocr/types';
import type { RuntimeMode } from '@/domain/translation/provider';

export interface OverlayRegion {
  id: string;
  sourceText: string;
  translatedText: string;
  box: BoundingBox;
  backgroundColor: string;
  fontSize: number;
}

export interface OverlayDocument {
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  regions: OverlayRegion[];
  mode: RuntimeMode;
  provider: string;
  warning?: string;
}

export interface CaptureResult {
  filePath: string;
  capturedAt: string;
}

export interface GlobalShortcutConfig {
  shortcut: string;
}

export interface CaptureSelectionPayload {
  x: number;
  y: number;
  width: number;
  height: number;
  displayId?: number;
  scaleFactor?: number;
}

export interface CaptureSelectionState {
  status: 'idle' | 'selecting';
  message?: string;
}

export interface PopupTranslationState {
  sourceText: string;
  translatedText: string;
  targetLang: string;
  sourceLang?: string;
  warning?: string;
  error?: string;
  isLoading?: boolean;
  updatedAt: string;
}

export interface WorkspaceDraftState {
  sourceText: string;
  translatedText?: string;
  targetLang: string;
  sourceLang?: string;
  warning?: string;
  ocrElapsedMs?: number;
  updatedAt: string;
  sourceType?: 'text' | 'popup' | 'capture';
  capture?: {
    imagePath: string;
    overlay?: OverlayDocument;
    regionCount?: number;
    capturedAt?: string;
  };
}
