import type { OcrEngine } from "@/lib/ocr/ocr-engine";

export const tesseractOcrProvider: OcrEngine = {
  id: "tesseract",
  label: "Tesseract (placeholder)",
  async run() {
    return {
      imageWidth: 1280,
      imageHeight: 720,
      regions: [
        {
          id: "region-1",
          text: "Translate the highlighted content",
          confidence: 0.94,
          box: { x: 96, y: 140, width: 360, height: 48 },
          style: {
            backgroundColor: "rgba(15,23,42,0.85)",
            textColor: "#f8fafc",
          },
        },
      ],
    };
  },
};
