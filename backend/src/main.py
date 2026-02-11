"""FlowBuildr backend app entrypoint."""

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Load .env from backend directory
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from src.api.routes import vision, floorplan, partitions
from src.core.config import get_settings

app = FastAPI(title="FlowBuildr API", version="0.1.0")

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(vision.router)
app.include_router(floorplan.router)
app.include_router(partitions.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/gemini/test")
def test_gemini():
    """Test Gemini API connection (Vertex AI or API key)."""
    settings = get_settings()
    if not settings.gemini_configured and not settings.vertex_configured:
        raise HTTPException(
            status_code=503,
            detail="Configure GEMINI_API_KEY or Vertex AI (GOOGLE_APPLICATION_CREDENTIALS + project) in .env",
        )

    try:
        from src.vision.providers.client import get_genai_client

        client = get_genai_client()
        # Gemini 2.5 Flash Lite: 4K RPM, 4M TPM, Unlimited RPD (best limits)
        model = "gemini-2.5-flash-lite"
        response = client.models.generate_content(
            model=model,
            contents="Reply with exactly: Gemini is working",
        )
        text = response.text or ""
        return {"status": "ok", "model": model, "reply": text.strip()}
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {str(e)}")
