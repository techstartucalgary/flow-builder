# Vertex AI Service Account Setup

Use the **vertex-express** service account for Vertex AI / Gemini in this project.

## 1. Download the JSON key

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and select project **gen-lang-client-0127620502**.
2. Open **IAM & Admin** → **Service Accounts**.
3. Click the service account: **vertex-express@gen-lang-client-0127620502.iam.gserviceaccount.com**.
4. Go to the **Keys** tab → **Add key** → **Create new key** → **JSON** → **Create**.
5. Save the downloaded JSON file somewhere **outside** your repo (e.g. `~/.config/gcloud/` or a folder that’s in `.gitignore`).

**Important:** Do not commit this file. It’s already ignored by `*-service-account*.json` and `*credentials*.json`.

## 2. Configure your environment

In `backend/.env` add (or update):

```bash
# Vertex AI
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/your-key.json
GOOGLE_CLOUD_PROJECT=gen-lang-client-0127620502
GOOGLE_CLOUD_LOCATION=us-central1
```

Replace `/absolute/path/to/your-key.json` with the real path to the JSON key file.

- **Key password:** If any tool asks for a password when using the key, the standard value is `notasecret` (used for PKCS#12 keys; JSON keys don’t use a password).

## 3. Use in code (google-genai SDK)

With `GOOGLE_APPLICATION_CREDENTIALS` set, you can use Vertex AI in Python:

```python
from google import genai

# Uses GOOGLE_APPLICATION_CREDENTIALS automatically
client = genai.Client(
    vertexai=True,
    project="gen-lang-client-0127620502",
    location="us-central1",
)

response = client.models.generate_content(
    model="gemini-2.0-flash",
    contents="Hello",
)
```

## Summary

| Item | Value |
|------|--------|
| Service account | vertex-express@gen-lang-client-0127620502.iam.gserviceaccount.com |
| Unique ID | 113517941869253248344 |
| Project | gen-lang-client-0127620502 |
| Key password (if prompted) | notasecret |
| Env var for key file | `GOOGLE_APPLICATION_CREDENTIALS` |
