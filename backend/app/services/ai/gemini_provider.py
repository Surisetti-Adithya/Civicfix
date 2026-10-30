import json
import re
import time
from typing import Optional, Tuple, Type
from pydantic import BaseModel, ValidationError
import httpx

from backend.app.services.ai.base import AiProvider
from backend.app.core.config import settings


def extract_json_from_text(text: str) -> Optional[dict]:
    cleaned = text.strip()

    # 1. Look for ```json ... ``` blocks (check from last block backwards)
    blocks = re.findall(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, re.DOTALL)
    for b in reversed(blocks):
        try:
            d = json.loads(b)
            if not any(v == "..." for v in d.values() if isinstance(v, str)):
                return d
        except Exception:
            pass

    # 2. Look for `key`: "value" pairs produced in Gemma reasoning
    kv_pairs = re.findall(r"`([a-zA-Z_]+)`\s*:\s*\"([^\"]+)\"", cleaned)
    if kv_pairs:
        d = dict(kv_pairs)
        if ("improved_description" in d and d["improved_description"] != "...") or ("category_id" in d):
            return d

    # 3. Search for any JSON objects in text from last to first
    for m in reversed(re.findall(r"(\{[^{}]+\})", cleaned)):
        try:
            d = json.loads(m)
            if not any(v == "..." for v in d.values() if isinstance(v, str)):
                return d
        except Exception:
            pass

    # 4. Outermost { ... }
    first_brace = cleaned.find("{")
    last_brace = cleaned.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        candidate = cleaned[first_brace:last_brace + 1]
        try:
            d = json.loads(candidate)
            if not any(v == "..." for v in d.values() if isinstance(v, str)):
                return d
        except Exception:
            pass

    try:
        return json.loads(cleaned)
    except Exception:
        pass

    return None


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
        timeout_seconds: Optional[float] = None,
    ) -> Tuple[Optional[dict], int, str]:
        if not self._api_key:
            return None, 0, "NO_API_KEY"

        if timeout_seconds is None:
            timeout_seconds = settings.AI_TIMEOUT_SECONDS

        start_time = time.perf_counter()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self._model_name}:generateContent?key={self._api_key}"

        # JSON schema representation for structured output
        schema_json = json.dumps(schema_class.model_json_schema())
        instruction_text = (
            f"{system_prompt}\n"
            f"You MUST reply ONLY with valid JSON conforming to this schema:\n{schema_json}"
        )

        is_gemma = "gemma" in self._model_name.lower()

        if is_gemma:
            # Gemma models on Gemini API do not support systemInstruction or responseMimeType="application/json" (causes HTTP 500)
            combined_prompt = f"{instruction_text}\n\nTask Input:\n{prompt}"
            payload = {
                "contents": [
                    {
                        "role": "user",
                        "parts": [{"text": combined_prompt}],
                    }
                ],
                "generationConfig": {
                    "temperature": 0.1,
                },
            }
        else:
            payload = {
                "contents": [
                    {
                        "role": "user",
                        "parts": [{"text": prompt}],
                    }
                ],
                "systemInstruction": {
                    "parts": [{"text": instruction_text}]
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
            raw_dict = extract_json_from_text(text_content)
            if not raw_dict:
                return None, latency_ms, "PARSE_ERROR"

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
