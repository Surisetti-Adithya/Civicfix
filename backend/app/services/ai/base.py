from abc import ABC, abstractmethod
from typing import Optional, Tuple, Type
from pydantic import BaseModel


class AiProvider(ABC):
    @property
    @abstractmethod
    def model_name(self) -> str:
        pass

    @abstractmethod
    async def generate_json(
        self,
        prompt: str,
        system_prompt: str,
        schema_class: Type[BaseModel],
        timeout_seconds: float = 15.0,
    ) -> Tuple[Optional[dict], int, str]:
        """
        Executes a call to the model requesting structured JSON output.
        Returns:
            Tuple of (parsed_dict_or_None, latency_ms, status_string)
            status_string can be "SUCCESS", "TIMEOUT", "PARSE_ERROR", "ERROR"
        """
        pass
