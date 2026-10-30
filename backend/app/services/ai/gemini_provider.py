import json
import time
from typing import Optional, Tuple, Type
from pydantic import BaseModel, ValidationError
import httpx

from backend.app.services.ai.base import AiProvider
from backend.app.core.config import settings


class HostedGeminiProvider(AiProvider):
    def __init__(self, api_key: Optional[str] = None, model_name: Optional[str] = None):
        self._api_key = api_key or settings.GEMINI_API_KEY
        self._model_name = model_name or settings.AI_MODEL_NAME

    @property
    def model_name(self) -> str:
        return self._model_name

    async def generate_json(
        self,
        prompt: str,
        system_prompt: str,
        schema_class: Type[BaseModel],
        timeout_seconds: float = 15.0,
    ) -> Tuple[Optional[dict], int, str]:
        if not self._api_key:
            return None, 0, "NO_API_KEY"

        start_time = time.perf_counter()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self._model_name}:generateContent?key={self._api_key}"

        # JSON schema representation for structured output
        schema_json = json.dumps(schema_class.model_json_schema())
        full_system = f"{system_prompt}\nYou MUST reply ONLY with valid JSON matching this schema:\n{schema_json}"

        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": prompt}],
                }
            ],
            "systemInstruction": {
                "parts": [{"text": full_system}]
            },
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json",
            },
        }

        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                response = await client.post(url, json=payload)

            latency_ms = int((time.perf_counter() - start_time) * 1000)

            if response.status_code != 200:
                return None, latency_ms, f"HTTP_{response.status_code}"

            res_json = response.json()
            candidates = res_json.get("candidates", [])
            if not candidates:
                return None, latency_ms, "NO_CANDIDATES"

            text_content = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            if not text_content:
                return None, latency_ms, "EMPTY_RESPONSE"

            # Parse and validate with Pydantic schema
            raw_dict = json.loads(text_content)
            validated = schema_class.model_validate(raw_dict)
            return validated.model_dump(), latency_ms, "SUCCESS"

        except httpx.TimeoutException:
            latency_ms = int((time.perf_counter() - start_time) * 1000)
            return None, latency_ms, "TIMEOUT"
        except (json.JSONDecodeError, ValidationError):
            latency_ms = int((time.perf_counter() - start_time) * 1000)
            return None, latency_ms, "PARSE_ERROR"
        except Exception:
            latency_ms = int((time.perf_counter() - start_time) * 1000)
            return None, latency_ms, "ERROR"
