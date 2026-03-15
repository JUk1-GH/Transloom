# Local OCR Sidecar

This sidecar wraps multiple local OCR engines behind a FastAPI service so Transloom
can call `http://127.0.0.1:8000/ocr` for screenshot OCR.

## Setup

```bash
npm run ocr:local:setup
```

The first install may take a while because Paddle packages and OCR models are large.

## Start

```bash
npm run ocr:local:start
```

The app still uses your current translation provider for the final translated text.
The local sidecar only replaces the screenshot text recognition step.

## Health Check

```bash
curl http://127.0.0.1:8000/health
```

## Notes

- Default OCR endpoint: `http://127.0.0.1:8000/ocr`
- Default OCR language: `ch`
- Default OCR profile: `mobile`
- Available local engines: `paddleocr`, `rapidocr`, `apple-vision`
- You can override language with `TRANSLOOM_LOCAL_OCR_LANG`
- You can switch to the heavier profile with `TRANSLOOM_LOCAL_OCR_MODEL=server npm run ocr:local:start`
- You can tune Apple Vision languages with `TRANSLOOM_LOCAL_OCR_APPLE_VISION_LANGS`
