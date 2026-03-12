import type { OverlayDocument } from "@/domain/capture/types";

export function TranslationOverlay({ overlay }: { overlay: OverlayDocument }) {
  return (
    <div className="relative h-[380px] overflow-hidden rounded-[20px] border border-slate-200 bg-slate-100/80">
      {overlay.regions.map((region) => (
        <div
          key={region.id}
          className="absolute rounded-2xl px-3 py-2 text-sm font-medium text-slate-900 shadow-sm"
          style={{
            left: region.box.x,
            top: region.box.y,
            width: region.box.width,
            minHeight: region.box.height,
            background: region.backgroundColor,
            fontSize: region.fontSize,
          }}
        >
          {region.translatedText}
        </div>
      ))}
    </div>
  );
}
