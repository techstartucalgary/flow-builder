"""Vision API routes — image analysis via Gemini."""

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from src.core.config import get_settings
from src.vision.providers.gemini_vision import DEFAULT_MODEL, analyze_image
from src.vision.schemas.vision import VisionResponse

router = APIRouter(prefix="/api/vision", tags=["vision"])

ALLOWED_MIME = frozenset({"image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"})


@router.post("/analyze", response_model=VisionResponse)
async def analyze(
    file: UploadFile = File(..., description="Image file to analyze"),
    prompt: str = Form(
        default="Describe this image in detail.",
        description="Question or instruction for the image analysis.",
    ),
):
    """
    Analyze an image or PDF using Gemini Vision.

    Upload a file (JPEG, PNG, GIF, WebP, PDF) and optionally provide a custom prompt.
    Returns the model's analysis of the document.
    """
    settings = get_settings()
    if not settings.gemini_configured and not settings.vertex_configured:
        raise HTTPException(
            status_code=503,
            detail="Configure GEMINI_API_KEY or Vertex AI (GOOGLE_APPLICATION_CREDENTIALS + project) in .env",
        )

    mime = file.content_type or "image/jpeg"
    if mime not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {mime}. Use JPEG, PNG, GIF, WebP, or PDF.",
        )

    try:
        image_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")

    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        analysis = analyze_image(
            image_bytes=image_bytes,
            mime_type=mime,
            prompt=prompt,
            model=DEFAULT_MODEL,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Vision API error: {str(e)}")

    return VisionResponse(
        status="ok",
        model=DEFAULT_MODEL,
        analysis=analysis.strip(),
        prompt=prompt,
    )
