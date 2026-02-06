# FlowBuildr Backend

Python backend for FlowBuildr — pipeline orchestration, vision/AI providers, and material estimation.

## Structure

- `src/main.py` — App entrypoint
- `src/api/` — HTTP routes and middleware
- `src/core/` — Config, logging, errors, constants
- `src/pipeline/` — Orchestrator and step runner
- `src/vision/` — AI providers, prompts, schemas
- `src/estimators/` — Material estimation (drywall, tile, exterior, common)
- `src/storage/` — File storage adapter (Supabase/S3/local)
- `src/db/` — DB client, migrations, models, repositories
- `src/jobs/` — Job state machine and status tracking
- `src/utils/` — Helpers (image ops, PDF utils)
- `tests/` — Unit and integration tests
- `data/` — Sample plans and golden outputs (dev only)

## Setup

```bash
# Create venv
python -m venv .venv
source .venv/bin/activate  # or `.venv\Scripts\activate` on Windows

# Install
pip install -e .

# Copy env
cp .env.example .env
```

## Run

```bash
uvicorn src.main:app --reload
```

## Vision API (Gemini)

Image analysis via Gemini Vision:

```bash
# Analyze an image with default prompt ("Describe this image in detail")
curl -X POST http://localhost:8000/api/vision/analyze \
  -F "file=@path/to/image.jpg"

# Custom prompt
curl -X POST http://localhost:8000/api/vision/analyze \
  -F "file=@plan.png" \
  -F "prompt=Extract all room dimensions and materials from this floor plan"
```

Supported formats: JPEG, PNG, GIF, WebP.
