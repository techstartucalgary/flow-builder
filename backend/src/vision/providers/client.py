"""Gemini client factory — Vertex AI or API key."""

from google import genai

from src.core.config import get_settings


def get_genai_client():
    """
    Return a configured genai.Client.
    Uses Vertex AI if GOOGLE_APPLICATION_CREDENTIALS and project are set,
    otherwise uses GEMINI_API_KEY.
    """
    settings = get_settings()
    if settings.vertex_configured:
        return genai.Client(
            vertexai=True,
            project=settings.google_cloud_project,
            location=settings.google_cloud_location,
        )
    if settings.gemini_configured:
        return genai.Client(api_key=settings.gemini_api_key)
    raise ValueError("Neither Vertex AI nor GEMINI_API_KEY is configured")
