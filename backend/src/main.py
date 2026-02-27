"""FlowBuildr backend app entrypoint."""

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env from backend directory
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from src.api.routes import partitions, takeoff, cv_takeoff

app = FastAPI(title="FlowBuildr API", version="0.1.0")

# Allow the Next.js frontend to call our API.
# Use explicit allow_headers (not *) so preflight works with allow_credentials=True.
app.add_middleware(
    CORSMiddleware,
    # Allow both localhost and 127.0.0.1 for the Next.js dev server
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://localhost:3002",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "Origin"],
    expose_headers=["*"],
)

app.include_router(partitions.router)
app.include_router(takeoff.router)
app.include_router(cv_takeoff.router)


@app.get("/health")
def health():
    return {"status": "ok"}
