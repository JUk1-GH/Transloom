from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from PIL import Image

from server import (
    APPLE_VISION_AVAILABLE,
    APPLE_VISION_LANGS,
    LOCAL_ENGINE_PROVIDER,
    OCR_LANG,
    OCR_MODEL_PROFILE,
    RapidOCR,
    run_apple_vision_ocr,
    run_paddle_ocr,
    run_rapid_ocr,
)


def send(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def build_health_result() -> dict[str, Any]:
    available_engines = ["paddleocr"]
    if RapidOCR is not None:
        available_engines.append("rapidocr")
    if APPLE_VISION_AVAILABLE:
        available_engines.append("apple-vision")

    return {
        "ok": True,
        "provider": "embedded-local-ocr",
        "lang": OCR_LANG,
        "model": OCR_MODEL_PROFILE,
        "availableEngines": available_engines,
        "appleVisionLanguages": APPLE_VISION_LANGS,
    }


def build_ocr_result(image_path: str, engine: str) -> dict[str, Any]:
    path_obj = Path(image_path).expanduser()
    if not path_obj.is_file():
        raise FileNotFoundError("Image file not found.")

    with Image.open(path_obj) as image:
        image_width, image_height = image.size

    if engine == "rapidocr":
        regions = run_rapid_ocr(str(path_obj))
    elif engine == "apple-vision":
        regions = run_apple_vision_ocr(str(path_obj), image_width, image_height)
    else:
        regions = run_paddle_ocr(str(path_obj))

    if not regions:
        raise ValueError("No OCR text regions were detected.")

    return {
        "provider": LOCAL_ENGINE_PROVIDER[engine],
        "imageWidth": image_width,
        "imageHeight": image_height,
        "regions": regions,
    }


def handle_request(payload: dict[str, Any]) -> dict[str, Any]:
    action = str(payload.get("action") or "").strip()

    if action == "health":
        return build_health_result()

    if action != "ocr":
        raise ValueError(f"Unsupported action: {action or 'unknown'}")

    image_path = str(payload.get("imagePath") or "").strip()
    engine = str(payload.get("engine") or "paddleocr").strip()
    return build_ocr_result(image_path, engine)


def main() -> None:
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        request_id: int | None = None
        try:
            payload = json.loads(line)
            request_id = int(payload["id"])
            result = handle_request(payload)
            send(
                {
                    "id": request_id,
                    "ok": True,
                    "result": result,
                }
            )
        except Exception as exc:
            send(
                {
                    "id": request_id or 0,
                    "ok": False,
                    "error": {
                        "code": exc.__class__.__name__.upper(),
                        "message": str(exc),
                        "status": 502,
                    },
                }
            )


if __name__ == "__main__":
    main()
