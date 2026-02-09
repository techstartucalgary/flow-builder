"""Gemini Vision provider for image analysis."""

from google.genai import types

from src.core.config import get_settings
from src.vision.providers.client import get_genai_client


# Gemini 3 Pro: 25 RPM, 1M TPM, 250 RPD — latest flagship vision model
DEFAULT_MODEL = "gemini-3-pro-preview"
VISION_MODELS = ["gemini-3-pro-preview", "gemini-3-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"]


def analyze_image(
    *,
    image_bytes: bytes,
    mime_type: str,
    prompt: str = "Describe this image in detail.",
    model: str = DEFAULT_MODEL,
) -> str:
    """
    Analyze an image using Gemini's vision capabilities.
    Uses Vertex AI or API key from config.

    Args:
        image_bytes: Raw image bytes
        mime_type: MIME type (e.g. image/jpeg, image/png)
        prompt: Question or instruction for the image
        model: Model ID to use

    Returns:
        Text analysis from the model
    """
    client = get_genai_client()

    image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)

    response = client.models.generate_content(
        model=model,
        contents=[
            types.Content(
                role="user",
                parts=[
                    types.Part.from_text(text=prompt),
                    image_part,
                ],
            )
        ],
    )

    return response.text or ""


async def analyze_with_gemini(
    *,
    file_bytes: bytes,
    mime_type: str,
    prompt: str,
    model_name: str = DEFAULT_MODEL
) -> dict:
    """
    Async wrapper for Gemini vision analysis.
    
    Args:
        file_bytes: Raw file bytes (image or PDF)
        mime_type: MIME type
        prompt: Analysis prompt
        model_name: Gemini model to use
        
    Returns:
        Dict with status, model, and analysis text
    """
    analysis_text = analyze_image(
        image_bytes=file_bytes,
        mime_type=mime_type,
        prompt=prompt,
        model=model_name
    )
    
    return {
        "status": "ok",
        "model": model_name,
        "analysis": analysis_text
    }
