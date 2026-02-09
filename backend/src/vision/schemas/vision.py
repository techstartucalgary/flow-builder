"""Vision request/response schemas."""

from pydantic import BaseModel, Field


class VisionRequest(BaseModel):
    """Request for image analysis."""

    prompt: str = Field(
        default="Describe this image in detail.",
        description="The question or instruction for the image analysis.",
    )


class VisionResponse(BaseModel):
    """Response from vision analysis."""

    status: str = "ok"
    model: str = Field(description="Model used for analysis")
    analysis: str = Field(description="Text response from the vision model")
    prompt: str | None = Field(default=None, description="The prompt that was used")
