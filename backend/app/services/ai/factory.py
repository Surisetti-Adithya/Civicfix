from backend.app.core.config import settings
from backend.app.services.ai.base import AiProvider
from backend.app.services.ai.gemini_provider import HostedGeminiProvider
from backend.app.services.ai.ollama_provider import OllamaProvider
from backend.app.services.ai.fake_provider import FakeAiProvider

_provider_instance: AiProvider = None


def get_ai_provider() -> AiProvider:
    global _provider_instance
    if _provider_instance is not None:
        return _provider_instance

    choice = settings.AI_PROVIDER.lower().strip()
    if choice == "ollama":
        _provider_instance = OllamaProvider()
    elif choice in ["fake", "mock", "test"]:
        _provider_instance = FakeAiProvider()
    elif choice == "gemini":
        _provider_instance = HostedGeminiProvider()
    else:
        _provider_instance = HostedGeminiProvider()

    return _provider_instance


def set_ai_provider(provider: AiProvider):
    global _provider_instance
    _provider_instance = provider
