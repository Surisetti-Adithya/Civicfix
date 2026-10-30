import time
from typing import Optional, Tuple, Type, Any
from pydantic import BaseModel

from backend.app.services.ai.base import AiProvider


class FakeAiProvider(AiProvider):
    def __init__(self, mode: str = "normal", custom_response: Optional[dict] = None):
        self._mode = mode
        self._custom_response = custom_response
        self._model_name = "fake-gemma-test"

    @property
    def model_name(self) -> str:
        return self._model_name

    def set_mode(self, mode: str, custom_response: Optional[dict] = None):
        self._mode = mode
        self._custom_response = custom_response

    async def generate_json(
        self,
        prompt: str,
        system_prompt: str,
        schema_class: Type[BaseModel],
        timeout_seconds: float = 15.0,
    ) -> Tuple[Optional[dict], int, str]:
        start = time.perf_counter()

        if self._mode == "timeout":
            time.sleep(0.01)
            return None, int((time.perf_counter() - start) * 1000), "TIMEOUT"

        if self._mode == "invalid_json":
            return None, int((time.perf_counter() - start) * 1000), "PARSE_ERROR"

        if self._mode == "error":
            return None, int((time.perf_counter() - start) * 1000), "ERROR"

        if self._custom_response:
            try:
                validated = schema_class.model_validate(self._custom_response)
                return validated.model_dump(), int((time.perf_counter() - start) * 1000), "SUCCESS"
            except Exception:
                return None, int((time.perf_counter() - start) * 1000), "PARSE_ERROR"

        # Default smart mock behavior based on schema type
        schema_name = schema_class.__name__

        if schema_name == "ImproveDescriptionOutput":
            cleaned = prompt.replace("Original complaint text:\n", "").strip()
            data = {
                "improved_description": f"Observed issue: {cleaned}",
                "explanation": "Clarified sentence structure while preserving user intent.",
            }
            if self._mode == "hallucination":
                # Introduces unsupported number or name
                data["improved_description"] = f"{cleaned} Reported 42 casualties near Mayor John estate."

            return data, int((time.perf_counter() - start) * 1000), "SUCCESS"

        if schema_name == "SuggestCategoryOutput":
            cat_id = 99999 if self._mode == "invalid_category" else 1
            data = {
                "category_id": cat_id,
                "reason": "Description matches municipal infrastructure maintenance.",
                "confidence": "HIGH",
            }
            return data, int((time.perf_counter() - start) * 1000), "SUCCESS"

        if schema_name == "AiDuplicateOutput":
            data = {
                "matches": [
                    {
                        "complaint_id": 1,
                        "is_possible_duplicate": True,
                        "reason": "Both reports cite water accumulation at identical junction.",
                        "confidence": "HIGH",
                    }
                ]
            }
            return data, int((time.perf_counter() - start) * 1000), "SUCCESS"

        return None, int((time.perf_counter() - start) * 1000), "NO_MOCK_AVAILABLE"
