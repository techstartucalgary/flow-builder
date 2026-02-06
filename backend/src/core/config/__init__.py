"""Configuration loading from environment."""

import os
from functools import lru_cache


@lru_cache
def get_settings() -> "Settings":
    return Settings()


class Settings:
    """App settings loaded from environment."""

    def __init__(self) -> None:
        self.app_env = os.getenv("APP_ENV", "development")
        self.debug = os.getenv("DEBUG", "true").lower() == "true"
        self.gemini_api_key = os.getenv("GEMINI_API_KEY", "")
        self.google_application_credentials = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
        self.google_cloud_project = os.getenv("GOOGLE_CLOUD_PROJECT", "")
        self.google_cloud_location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")

    @property
    def gemini_configured(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def vertex_configured(self) -> bool:
        return bool(
            self.google_application_credentials
            and self.google_cloud_project
            and os.path.isfile(self.google_application_credentials)
        )
