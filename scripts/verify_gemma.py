#!/usr/bin/env python3
import asyncio
import os
import sys
import time

# Ensure project root is in sys.path
sys.path.insert(0, "/home/alumina/civic")

from backend.app.core.config import settings
from backend.app.services.ai.factory import get_ai_provider, set_ai_provider
from backend.app.services.ai.gemini_provider import HostedGeminiProvider
from backend.app.services.ai.ollama_provider import OllamaProvider
from backend.app.services.ai.fake_provider import FakeAiProvider
from backend.app.schemas.ai import (
    ImproveDescriptionOutput,
    SuggestCategoryOutput,
    AiDuplicateOutput,
)


async def verify_main_features():
    print("==================================================")
    print("CivicFix - Gemma AI Verification Script")
    print("==================================================")

    # Determine provider
    provider = get_ai_provider()
    if "--fake" in sys.argv or "--mock" in sys.argv:
        provider = FakeAiProvider()
        set_ai_provider(provider)
    elif "--ollama" in sys.argv:
        provider = OllamaProvider()
        set_ai_provider(provider)
    elif os.getenv("GEMINI_API_KEY"):
        provider = HostedGeminiProvider(api_key=os.getenv("GEMINI_API_KEY"))
        set_ai_provider(provider)

    print(f"Active AI Provider: {provider.__class__.__name__}")
    print(f"Target Model: {provider.model_name}")
    print("--------------------------------------------------")

    success_count = 0

    # 1. Feature A: Description Improvement
    print("[1/3] Testing Feature A: Description Improvement...")
    prompt_a = (
        "Improve this civic complaint description for official staff review while keeping the exact meaning and facts:\n"
        "water leaking from pipe on 4th floor near elevator since morning"
    )
    system_a = (
        "You are an AI assistant that improves community complaint descriptions for civic review.\n"
        "Keep the exact meaning and facts. Do not add dates, places, or injuries.\n"
        "Output strictly valid JSON with keys: improved_description and explanation."
    )
    t0 = time.perf_counter()
    res_a, latency_a, status_a = await provider.generate_json(
        prompt=prompt_a,
        system_prompt=system_a,
        schema_class=ImproveDescriptionOutput,
    )
    if status_a == "SUCCESS" and res_a:
        print(f"  Result: SUCCESS")
        print(f"  Model: {provider.model_name}")
        print(f"  Latency: {latency_a} ms")
        print(f"  Output: {res_a.get('improved_description')[:80]}...")
        success_count += 1
    else:
        print(f"  Result: FAILED (Status: {status_a})")

    print("--------------------------------------------------")

    # 2. Feature B: Category Suggestion
    print("[2/3] Testing Feature B: Category Suggestion...")
    categories_str = (
        "ID: 101, Name: Plumbing, Description: Water leaks and piping\n"
        "ID: 102, Name: Electrical, Description: Wiring and lights\n"
        "ID: 103, Name: Sanitation, Description: Waste and cleaning"
    )
    prompt_b = (
        f"Available Categories:\n{categories_str}\n\n"
        "Complaint description:\nWater pipe burst in basement and pooling near meter box"
    )
    system_b = (
        "Select one category ID exclusively from the provided category list.\n"
        "Output strictly valid JSON with category_id, reason, confidence."
    )
    res_b, latency_b, status_b = await provider.generate_json(
        prompt=prompt_b,
        system_prompt=system_b,
        schema_class=SuggestCategoryOutput,
    )
    if status_b == "SUCCESS" and res_b:
        print(f"  Result: SUCCESS")
        print(f"  Model: {provider.model_name}")
        print(f"  Latency: {latency_b} ms")
        print(f"  Suggested Category ID: {res_b.get('category_id')}, Confidence: {res_b.get('confidence')}")
        success_count += 1
    else:
        print(f"  Result: FAILED (Status: {status_b})")

    print("--------------------------------------------------")

    # 3. Feature C: Duplicate Candidates
    print("[3/3] Testing Feature C: Duplicate Candidates...")
    candidates_str = (
        "ID: 1, Ref: CF-2026-0001, Location: Basement B1, Description: Water leaking near pump room\n"
        "ID: 2, Ref: CF-2026-0002, Location: 5th Floor, Description: Hallway light not working"
    )
    prompt_c = (
        f"New complaint:\nDescription: Water leak from pump pipe in basement\nLocation: Basement B1\n\n"
        f"Existing candidate complaints:\n{candidates_str}"
    )
    system_c = (
        "Evaluate whether the new complaint is a possible duplicate of any existing complaint.\n"
        "Output strictly valid JSON with matches list."
    )
    res_c, latency_c, status_c = await provider.generate_json(
        prompt=prompt_c,
        system_prompt=system_c,
        schema_class=AiDuplicateOutput,
    )
    if status_c == "SUCCESS" and res_c:
        print(f"  Result: SUCCESS")
        print(f"  Model: {provider.model_name}")
        print(f"  Latency: {latency_c} ms")
        matches = res_c.get("matches", [])
        print(f"  Evaluated Matches: {len(matches)}")
        success_count += 1
    else:
        print(f"  Result: FAILED (Status: {status_c})")

    print("==================================================")
    if success_count == 3:
        print("All 3 Gemma AI features verified successfully.")
        return 0
    else:
        print(f"Verification incomplete: {success_count}/3 passed.")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(verify_main_features())
    sys.exit(exit_code)
