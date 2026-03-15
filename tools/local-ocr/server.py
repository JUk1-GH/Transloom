from __future__ import annotations

import os
import warnings
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel

warnings.filterwarnings("ignore", message=".*RequestsDependencyWarning.*")

try:
    from paddleocr import PaddleOCR
except ImportError as exc:  # pragma: no cover - import failure is surfaced at runtime
    raise RuntimeError(
        "paddleocr is not installed. Run the local OCR setup first."
    ) from exc

try:
    from rapidocr import RapidOCR
except ImportError:  # pragma: no cover - optional engine
    RapidOCR = None

try:
    from Foundation import NSURL
    from Vision import (
        VNImageRequestHandler,
        VNRecognizeTextRequest,
        VNRequestTextRecognitionLevelAccurate,
        VNRequestTextRecognitionLevelFast,
    )

    APPLE_VISION_AVAILABLE = True
except ImportError:  # pragma: no cover - optional engine
    NSURL = None
    VNImageRequestHandler = None
    VNRecognizeTextRequest = None
    VNRequestTextRecognitionLevelAccurate = None
    VNRequestTextRecognitionLevelFast = None
    APPLE_VISION_AVAILABLE = False


APP = FastAPI(title="Transloom Local OCR", version="0.2.0")
DEFAULT_BACKGROUND = "rgba(15, 23, 42, 0.82)"
OCR_LANG = os.environ.get("TRANSLOOM_LOCAL_OCR_LANG", "ch")
OCR_MODEL = os.environ.get("TRANSLOOM_LOCAL_OCR_MODEL", "mobile").strip().lower()
APPLE_VISION_LANGS = [
    item.strip()
    for item in os.environ.get(
        "TRANSLOOM_LOCAL_OCR_APPLE_VISION_LANGS",
        "zh-Hans,en-US",
    ).split(",")
    if item.strip()
]
APPLE_VISION_LEVEL = (
    os.environ.get("TRANSLOOM_LOCAL_OCR_APPLE_VISION_LEVEL", "accurate")
    .strip()
    .lower()
)

PADDLE_OCR: PaddleOCR | None = None
RAPID_OCR: RapidOCR | None = None


def resolve_model_names() -> tuple[str, str, str]:
    if OCR_MODEL in {"server", "pp-ocrv5-server", "pp-ocrv5_server"}:
        return ("PP-OCRv5_server_det", "PP-OCRv5_server_rec", "server")

    return ("PP-OCRv5_mobile_det", "PP-OCRv5_mobile_rec", "mobile")


TEXT_DETECTION_MODEL, TEXT_RECOGNITION_MODEL, OCR_MODEL_PROFILE = resolve_model_names()
LOCAL_ENGINE_PROVIDER = {
    "paddleocr": "local-paddleocr",
    "rapidocr": "rapidocr",
    "apple-vision": "apple-vision",
}


class OcrRequest(BaseModel):
    image_path: str
    engine: Literal["paddleocr", "rapidocr", "apple-vision"] = "paddleocr"


def build_paddle_ocr() -> PaddleOCR:
    common_options = {
        "use_doc_orientation_classify": False,
        "use_doc_unwarping": False,
        "use_textline_orientation": False,
    }

    if OCR_LANG != "ch":
        return PaddleOCR(
            **common_options,
            lang=OCR_LANG,
            ocr_version="PP-OCRv5",
        )

    return PaddleOCR(
        **common_options,
        text_detection_model_name=TEXT_DETECTION_MODEL,
        text_recognition_model_name=TEXT_RECOGNITION_MODEL,
    )


def get_paddle_ocr() -> PaddleOCR:
    global PADDLE_OCR

    if PADDLE_OCR is None:
        PADDLE_OCR = build_paddle_ocr()

    return PADDLE_OCR


def get_rapid_ocr() -> RapidOCR:
    global RAPID_OCR

    if RapidOCR is None:
        raise RuntimeError(
            "rapidocr is not installed. Run npm run ocr:local:setup first."
        )

    if RAPID_OCR is None:
        RAPID_OCR = RapidOCR()

    return RAPID_OCR


def resolve_apple_vision_level():
    if APPLE_VISION_LEVEL == "fast":
        return VNRequestTextRecognitionLevelFast

    return VNRequestTextRecognitionLevelAccurate


def coerce_points(points: Any) -> list[tuple[float, float]] | None:
    try:
        normalized: list[tuple[float, float]] = []
        for point in points:
            normalized.append((float(point[0]), float(point[1])))
        return normalized or None
    except Exception:
        return None


def to_box(points: Any) -> dict[str, int]:
    normalized_points = coerce_points(points)
    if not normalized_points:
        raise ValueError("Invalid OCR polygon.")

    xs = [point[0] for point in normalized_points]
    ys = [point[1] for point in normalized_points]

    return {
        "x": int(min(xs)),
        "y": int(min(ys)),
        "width": max(1, int(max(xs) - min(xs))),
        "height": max(1, int(max(ys) - min(ys))),
    }


def to_region(
    region_id: str,
    text: str,
    confidence: float,
    box: dict[str, int],
) -> dict[str, Any]:
    return {
        "id": region_id,
        "text": text,
        "confidence": confidence,
        "box": box,
        "style": {
            "backgroundColor": DEFAULT_BACKGROUND,
            "textColor": "#f8fafc",
        },
    }


def normalize_legacy_result(result: Any) -> list[dict[str, Any]]:
    lines = result[0] if isinstance(result, list) and result else []
    regions: list[dict[str, Any]] = []

    for index, line in enumerate(lines):
        if not isinstance(line, (list, tuple)) or len(line) < 2:
            continue

        polygon = line[0]
        text_meta = line[1]

        text = ""
        confidence = 0.85
        if isinstance(text_meta, (list, tuple)) and text_meta:
            text = str(text_meta[0]).strip()
            if len(text_meta) > 1:
                try:
                    confidence = float(text_meta[1])
                except (TypeError, ValueError):
                    confidence = 0.85
        elif text_meta is not None:
            text = str(text_meta).strip()

        if not text:
            continue

        try:
            box = to_box(polygon)
        except ValueError:
            continue

        regions.append(
            to_region(
                f"local-{index + 1}",
                text,
                confidence,
                box,
            )
        )

    return regions


def normalize_predict_result(result: Any) -> list[dict[str, Any]]:
    entries = result if isinstance(result, list) else [result]
    regions: list[dict[str, Any]] = []
    region_index = 0

    for entry in entries:
        data = entry
        if hasattr(entry, "json") and callable(entry.json):
            data = entry.json()
        elif hasattr(entry, "res"):
            data = entry.res

        if not isinstance(data, dict):
            continue

        texts = data.get("rec_texts") or []
        scores = data.get("rec_scores") or []
        polygons = data.get("rec_polys") or data.get("dt_polys") or []

        for index, text in enumerate(texts):
            cleaned_text = str(text).strip()
            if not cleaned_text:
                continue

            polygon = polygons[index] if index < len(polygons) else None
            if polygon is None:
                continue

            try:
                box = to_box(polygon)
            except ValueError:
                continue

            score = scores[index] if index < len(scores) else None
            confidence = 0.85
            if score is not None:
                try:
                    confidence = float(score)
                except (TypeError, ValueError):
                    confidence = 0.85

            region_index += 1
            regions.append(
                to_region(
                    f"local-{region_index}",
                    cleaned_text,
                    confidence,
                    box,
                )
            )

    return regions


def normalize_rapidocr_result(result: Any) -> list[dict[str, Any]]:
    texts = tuple(getattr(result, "txts", ()) or ())
    scores = tuple(getattr(result, "scores", ()) or ())
    boxes = getattr(result, "boxes", None)
    if boxes is None:
        boxes = ()
    regions: list[dict[str, Any]] = []

    for index, text in enumerate(texts):
        cleaned_text = str(text).strip()
        if not cleaned_text:
            continue

        polygon = boxes[index] if index < len(boxes) else None
        if polygon is None:
            continue

        try:
            box = to_box(polygon)
        except ValueError:
            continue

        score = scores[index] if index < len(scores) else None
        confidence = 0.85
        if score is not None:
            try:
                confidence = float(score)
            except (TypeError, ValueError):
                confidence = 0.85

        regions.append(
            to_region(
                f"rapid-{index + 1}",
                cleaned_text,
                confidence,
                box,
            )
        )

    return regions


def normalize_vision_box(
    bounding_box: Any, image_width: int, image_height: int
) -> dict[str, int]:
    origin = bounding_box.origin
    size = bounding_box.size

    return {
        "x": max(0, int(origin.x * image_width)),
        "y": max(0, int((1 - origin.y - size.height) * image_height)),
        "width": max(1, int(size.width * image_width)),
        "height": max(1, int(size.height * image_height)),
    }


def run_paddle_ocr(image_path: str) -> list[dict[str, Any]]:
    ocr = get_paddle_ocr()

    if hasattr(ocr, "predict"):
        result = ocr.predict(image_path)
        normalized = normalize_predict_result(result)
        if normalized:
            return normalized

    if hasattr(ocr, "ocr"):
        result = ocr.ocr(image_path, cls=False)
        return normalize_legacy_result(result)

    raise RuntimeError("Unsupported PaddleOCR runtime: no predict or ocr method available.")


def run_rapid_ocr(image_path: str) -> list[dict[str, Any]]:
    ocr = get_rapid_ocr()
    result = ocr(image_path)
    return normalize_rapidocr_result(result)


def run_apple_vision_ocr(
    image_path: str, image_width: int, image_height: int
) -> list[dict[str, Any]]:
    if not APPLE_VISION_AVAILABLE:
        raise RuntimeError(
            "Apple Vision Framework is not available. Run npm run ocr:local:setup first."
        )

    url = NSURL.fileURLWithPath_(image_path)
    request = VNRecognizeTextRequest.alloc().init()
    request.setRecognitionLevel_(resolve_apple_vision_level())
    request.setUsesLanguageCorrection_(False)
    if APPLE_VISION_LANGS:
        request.setRecognitionLanguages_(APPLE_VISION_LANGS)

    handler = VNImageRequestHandler.alloc().initWithURL_options_(url, None)
    success, error = handler.performRequests_error_([request], None)
    if not success:
        raise RuntimeError(str(error) if error is not None else "Apple Vision request failed.")

    results = request.results() or []
    regions: list[dict[str, Any]] = []

    for index, observation in enumerate(results):
        candidates = observation.topCandidates_(1)
        if not candidates:
            continue

        candidate = candidates[0]
        text = str(candidate.string()).strip()
        if not text:
            continue

        regions.append(
            to_region(
                f"vision-{index + 1}",
                text,
                float(candidate.confidence()),
                normalize_vision_box(
                    observation.boundingBox(),
                    image_width,
                    image_height,
                ),
            )
        )

    return regions


@APP.get("/health")
def health() -> dict[str, Any]:
    available_engines = ["paddleocr"]
    if RapidOCR is not None:
        available_engines.append("rapidocr")
    if APPLE_VISION_AVAILABLE:
        available_engines.append("apple-vision")

    return {
        "ok": True,
        "provider": "local-ocr",
        "lang": OCR_LANG,
        "model": OCR_MODEL_PROFILE,
        "availableEngines": available_engines,
        "appleVisionLanguages": APPLE_VISION_LANGS,
    }


@APP.post("/ocr")
def ocr(payload: OcrRequest) -> dict[str, Any]:
    image_path = Path(payload.image_path).expanduser()
    if not image_path.is_file():
        raise HTTPException(status_code=404, detail="Image file not found.")

    try:
        with Image.open(image_path) as image:
            image_width, image_height = image.size
    except Exception as exc:  # pragma: no cover - PIL raises many concrete errors
        raise HTTPException(status_code=400, detail=f"Unable to open image: {exc}") from exc

    try:
        if payload.engine == "rapidocr":
            regions = run_rapid_ocr(str(image_path))
        elif payload.engine == "apple-vision":
            regions = run_apple_vision_ocr(str(image_path), image_width, image_height)
        else:
            regions = run_paddle_ocr(str(image_path))
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - surfaced to caller
        raise HTTPException(status_code=502, detail=f"Local OCR failed: {exc}") from exc

    if not regions:
        raise HTTPException(status_code=422, detail="No OCR text regions were detected.")

    return {
        "provider": LOCAL_ENGINE_PROVIDER[payload.engine],
        "imageWidth": image_width,
        "imageHeight": image_height,
        "regions": regions,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server:APP",
        host=os.environ.get("TRANSLOOM_LOCAL_OCR_HOST", "127.0.0.1"),
        port=int(os.environ.get("TRANSLOOM_LOCAL_OCR_PORT", "8000")),
        reload=False,
    )
