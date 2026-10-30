import json
import time
from typing import Optional, Tuple, Type
from pydantic import BaseModel, ValidationError
import httpx

from backend.app.services.ai.base import AiProvider
from backend.app.core.config import settings


class OllamaProvider(AiProvider):
    def __init__(self, base_url: Optional[str] = None, model_name: Optional[str] = None):
        self._base_url = (base_url or settings.OLLAMA_BASE_URL).rstrip("/")
        self._model_name = model_name or settings.AI_MODEL_NAME or "gemma2:2b"

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
        start_time = time.perf_counter()
        url = f"{self._base_url}/api/generate"

        schema_json = json.dumps(schema_class.model_json_schema())
        full_system = f"{system_prompt}\nRespond strictly with JSON adhering to this schema:\n{schema_json}"

        payload = {
            "model": self._model_name,
            "prompt": prompt,
            "system": full_system,
            "stream": False,
            "format": "json",
            "options": {"temperature": 0.1},
        }

        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                response = await client.post(url, json=payload)

            latency_ms = int((time.perf_counter() - start_time) * 1000)

            if response.status_code != 200:
                return None, latency_ms, f"HTTP_{response.status_code}"

            res_json = response.json()
            raw_text = res_json.get("response", "")
            if not raw_text:
                return None, latency_ms, "EMPTY_RESPONSE"

            parsed_data = json.loads(raw_text)
            validated = schema_class.model_validate(parsed_data)
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
