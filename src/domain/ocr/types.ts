export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisualRegionStyle {
  backgroundColor: string;
  textColor?: string;
}

export interface OcrTextRegion {
  id: string;
  text: string;
  box: BoundingBox;
  confidence: number;
  style: VisualRegionStyle;
}

export interface OcrResult {
  imageWidth: number;
  imageHeight: number;
  regions: OcrTextRegion[];
}
