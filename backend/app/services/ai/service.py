import datetime
import math
import re
from typing import List, Optional, Tuple, Dict, Any
from sqlalchemy.orm import Session as DBSession

from backend.app.core.config import settings
from backend.app.core.errors import CivicFixException
from backend.app.models import (
    Category,
    Complaint,
    AiCallLog,
)
from backend.app.schemas.ai import (
    ImproveDescriptionOutput,
    ImproveDescriptionResponse,
    SuggestCategoryOutput,
    SuggestCategoryResponse,
    AiDuplicateOutput,
    AiSimilarityCheckOutput,
    DuplicateCandidateResponse,
)
from backend.app.services.ai.factory import get_ai_provider

# Rate limiting in-memory store: user_id -> list of timestamps
_user_ai_calls: Dict[int, List[float]] = {}


def check_ai_rate_limit(user_id: int):
    now = datetime.datetime.now().timestamp()
    calls = _user_ai_calls.setdefault(user_id, [])
    # Keep calls within past 60 seconds
    valid_calls = [t for t in calls if now - t < 60.0]
    _user_ai_calls[user_id] = valid_calls

    if len(valid_calls) >= settings.AI_RATE_LIMIT_PER_MINUTE:
        raise CivicFixException(
            code="RATE_LIMIT_EXCEEDED",
            message=f"Rate limit exceeded. Maximum {settings.AI_RATE_LIMIT_PER_MINUTE} AI requests per minute.",
            status_code=429,
        )

    _user_ai_calls[user_id].append(now)


def extract_numbers(text: str) -> set[str]:
    return set(re.findall(r"\b\d+(?:\.\d+)?\b", text))


def extract_proper_nouns(text: str) -> set[str]:
    # Extract capitalized words that are not starting a sentence
    words = text.split()
    proper_nouns = set()
    for i, w in enumerate(words):
        clean_word = re.sub(r"[^\w]", "", w)
        if clean_word and clean_word[0].isupper() and not clean_word.isupper():
            # If not first word of text and previous word did not end with punctuation
            if i > 0 and not re.search(r"[.!?]$", words[i - 1]):
                proper_nouns.add(clean_word.lower())
    return proper_nouns


def verify_no_hallucinations(input_text: str, output_text: str) -> bool:
    input_numbers = extract_numbers(input_text)
    output_numbers = extract_numbers(output_text)

    # Any new number introduced?
    if not output_numbers.issubset(input_numbers):
        return False

    # Extract all lowercase words from input
    input_words = set(re.findall(r"\w+", input_text.lower()))

    # Proper nouns in output: words that are capitalized mid-sentence
    output_proper = extract_proper_nouns(output_text)
    
    # Common English words/stop words that can be capitalized
    common_words = {
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
        "structured", "summary", "complaint", "issue", "report", "location", "details",
        "near", "inside", "outside", "regarding", "observed"
    }

    new_proper = [
        w for w in output_proper
        if w not in input_words and w not in common_words
    ]
    if new_proper:
        return False

    return True


def log_ai_call(
    db: DBSession,
    organization_id: int,
    feature: str,
    model_name: str,
    status: str,
    latency_ms: int,
    input_size: int,
):
    entry = AiCallLog(
        organization_id=organization_id,
        feature=feature,
        model_name=model_name,
        status=status,
        latency_ms=latency_ms,
        input_size=input_size,
    )
    db.add(entry)
    db.commit()


async def improve_description_service(
    db: DBSession,
    organization_id: int,
    user_id: int,
    description: str,
) -> ImproveDescriptionResponse:
    check_ai_rate_limit(user_id)
    provider = get_ai_provider()

    system_prompt = (
        "You are an AI assistant that improves community complaint descriptions for civic staff review.\n"
        "Rules:\n"
        "1. Keep the exact meaning of the original text.\n"
        "2. Do NOT add any dates, places, injuries, damage, measurements, evidence, or official statements that are not in the input.\n"
        "3. Use the same language as the input.\n"
        "4. Output strictly valid JSON."
    )
    prompt = f"Original complaint text:\n{description.strip()}"
    input_size = len(prompt)

    # Call with 1 retry
    res_dict = None
    latency_ms = 0
    status = "ERROR"

    for _ in range(settings.AI_MAX_RETRIES + 1):
        res_dict, latency_ms, status = await provider.generate_json(
            prompt=prompt,
            system_prompt=system_prompt,
            schema_class=ImproveDescriptionOutput,
            timeout_seconds=settings.AI_TIMEOUT_SECONDS,
        )
        if status == "SUCCESS" and res_dict:
            break

    if status != "SUCCESS" or not res_dict:
        log_ai_call(db, organization_id, "improve-description", provider.model_name, status, latency_ms, input_size)
        return ImproveDescriptionResponse(
            improved_description=None,
            original_description=description,
            message="No AI suggestion available at this time.",
        )

    improved_text = res_dict.get("improved_description", "").strip()

    # Safety check: compare numbers and proper names
    if not verify_no_hallucinations(description, improved_text):
        log_ai_call(db, organization_id, "improve-description", provider.model_name, "REJECTED_HALLUCINATION", latency_ms, input_size)
        return ImproveDescriptionResponse(
            improved_description=None,
            original_description=description,
            message="AI suggestion rejected: unsupported numbers or entities detected.",
        )

    log_ai_call(db, organization_id, "improve-description", provider.model_name, "SUCCESS", latency_ms, input_size)
    return ImproveDescriptionResponse(
        improved_description=improved_text,
        original_description=description,
        is_ai_suggestion=True,
    )


async def suggest_category_service(
    db: DBSession,
    organization_id: int,
    user_id: int,
    description: str,
) -> SuggestCategoryResponse:
    check_ai_rate_limit(user_id)
    provider = get_ai_provider()

    # Load categories for organization
    categories = (
        db.query(Category)
        .filter(Category.organization_id == organization_id, Category.is_active.is_(True))
        .all()
    )
    if not categories:
        return SuggestCategoryResponse(
            category_id=None,
            reason="No active categories found for organization.",
            confidence="LOW",
        )

    cat_list_str = "\n".join(
        f"ID: {c.id}, Name: {c.name}, Description: {c.description or ''}"
        for c in categories
    )
    category_id_map = {c.id: c.name for c in categories}

    system_prompt = (
        "You are an AI assistant that suggests the most appropriate category for a civic complaint.\n"
        "Rules:\n"
        "1. Select one category ID exclusively from the provided category list.\n"
        "2. Do NOT invent new categories.\n"
        "3. Confidence must be 'HIGH', 'MEDIUM', or 'LOW'.\n"
        "4. Output strictly valid JSON."
    )
    prompt = (
        f"Available Categories:\n{cat_list_str}\n\n"
        f"Complaint description:\n{description.strip()}"
    )
    input_size = len(prompt)

    res_dict = None
    latency_ms = 0
    status = "ERROR"

    for _ in range(settings.AI_MAX_RETRIES + 1):
        res_dict, latency_ms, status = await provider.generate_json(
            prompt=prompt,
            system_prompt=system_prompt,
            schema_class=SuggestCategoryOutput,
            timeout_seconds=settings.AI_TIMEOUT_SECONDS,
        )
        if status == "SUCCESS" and res_dict:
            break

    if status != "SUCCESS" or not res_dict:
        log_ai_call(db, organization_id, "suggest-category", provider.model_name, status, latency_ms, input_size)
        return SuggestCategoryResponse(
            category_id=None,
            reason="AI suggestion unavailable.",
            confidence="LOW",
        )

    suggested_id = res_dict.get("category_id")

    # Safety validation: MUST be in allowed category list
    if suggested_id not in category_id_map:
        log_ai_call(db, organization_id, "suggest-category", provider.model_name, "REJECTED_INVALID_CATEGORY", latency_ms, input_size)
        return SuggestCategoryResponse(
            category_id=None,
            reason="Model suggested a category ID outside the permitted list.",
            confidence="LOW",
        )

    log_ai_call(db, organization_id, "suggest-category", provider.model_name, "SUCCESS", latency_ms, input_size)
    return SuggestCategoryResponse(
        category_id=suggested_id,
        category_name=category_id_map[suggested_id],
        reason=res_dict.get("reason", ""),
        confidence=res_dict.get("confidence", "MEDIUM"),
        is_ai_suggestion=True,
    )


def compute_text_similarity(t1: str, t2: str) -> float:
    # Jaccard word set similarity
    s1 = set(re.findall(r"\w+", t1.lower()))
    s2 = set(re.findall(r"\w+", t2.lower()))
    if not s1 or not s2:
        return 0.0
    return len(s1.intersection(s2)) / len(s1.union(s2))


async def find_duplicate_candidates_service(
    db: DBSession,
    organization_id: int,
    user_id: int,
    description: str,
    category_id: Optional[int] = None,
    location_text: Optional[str] = None,
    limit: int = 5,
) -> DuplicateCandidateResponse:
    check_ai_rate_limit(user_id)
    provider = get_ai_provider()

    # Step 1: Cheap database filters
    cutoff_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=30)
    query = (
        db.query(Complaint)
        .filter(
            Complaint.organization_id == organization_id,
            Complaint.created_at >= cutoff_time,
            Complaint.status.notin_(["REJECTED", "CLOSED"]),
        )
    )
    if category_id:
        query = query.filter(Complaint.category_id == category_id)

    db_candidates = query.limit(50).all()
    if not db_candidates:
        return DuplicateCandidateResponse(candidates=[], is_ai_suggestion=True)

    # Calculate text similarity score
    scored_candidates = []
    for c in db_candidates:
        sim = compute_text_similarity(description, c.description_original)
        scored_candidates.append((c, sim))

    # Step 2: Keep top N
    scored_candidates.sort(key=lambda x: x[1], reverse=True)
    top_candidates = scored_candidates[:limit]

    # If no similarity above threshold, return empty
    if not top_candidates or top_candidates[0][1] < 0.05:
        return DuplicateCandidateResponse(candidates=[], is_ai_suggestion=True)

    # Step 3: Gemma compares short texts
    candidates_text = "\n".join(
        f"ID: {c.id}, Ref: {c.public_reference_number}, Location: {c.location_text}, Description: {c.description_original[:150]}"
        for c, _ in top_candidates
    )

    system_prompt = (
        "You are an AI assistant that evaluates whether a new community complaint is a duplicate of existing complaints.\n"
        "Rules:\n"
        "1. Return only JSON with a list of matches.\n"
        "2. Include confidence ('HIGH', 'MEDIUM', 'LOW') and a short factual reason.\n"
        "3. System never merges complaints automatically."
    )
    prompt = (
        f"New complaint:\nDescription: {description[:200]}\nLocation: {location_text or 'Unknown'}\n\n"
        f"Existing candidate complaints:\n{candidates_text}"
    )
    input_size = len(prompt)

    res_dict = None
    latency_ms = 0
    status = "ERROR"

    for _ in range(settings.AI_MAX_RETRIES + 1):
        res_dict, latency_ms, status = await provider.generate_json(
            prompt=prompt,
            system_prompt=system_prompt,
            schema_class=AiDuplicateOutput,
            timeout_seconds=settings.AI_TIMEOUT_SECONDS,
        )
        if status == "SUCCESS" and res_dict:
            break

    log_ai_call(db, organization_id, "duplicate-candidates", provider.model_name, status, latency_ms, input_size)

    final_candidates = []
    ai_matches = {m["complaint_id"]: m for m in res_dict.get("matches", [])} if res_dict else {}

    for c, sim in top_candidates:
        match_info = ai_matches.get(c.id)
        final_candidates.append({
            "complaint_id": c.id,
            "public_reference_number": c.public_reference_number,
            "location_text": c.location_text,
            "description": c.description_original[:150],
            "similarity_score": round(sim, 2),
            "is_possible_duplicate": match_info.get("is_possible_duplicate", sim > 0.3) if match_info else (sim > 0.3),
            "reason": match_info.get("reason", "Text and location overlap detected by preliminary filters.") if match_info else "Keyword overlap.",
            "confidence": match_info.get("confidence", "MEDIUM" if sim > 0.3 else "LOW") if match_info else "LOW",
        })

    return DuplicateCandidateResponse(candidates=final_candidates, is_ai_suggestion=True)


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


async def check_complaint_similarity_service(
    db: DBSession,
    organization_id: int,
    user_id: int,
    category_id: int,
    description: str,
    location_text: str,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    photo_name: Optional[str] = None,
) -> Optional[Tuple[Complaint, str, float]]:
    """
    Checks if a new post under the same category is similar to an existing post
    by evaluating text, photos/media, and geographic location using Gemma AI.
    Returns (matched_complaint, reason, similarity_score) if a similarity match is found.
    """
    check_ai_rate_limit(user_id)
    provider = get_ai_provider()

    # Query active posts under the same category in the organization
    candidates = (
        db.query(Complaint)
        .filter(
            Complaint.organization_id == organization_id,
            Complaint.category_id == category_id,
            Complaint.status.notin_(["REJECTED", "CLOSED"]),
        )
        .order_by(Complaint.created_at.desc())
        .limit(20)
        .all()
    )
    if not candidates:
        return None

    category = db.query(Category).filter(Category.id == category_id).first()
    category_name = category.name if category else "General"

    scored_candidates = []
    for c in candidates:
        # 1. Text similarity
        text_sim = compute_text_similarity(description, c.description_original)
        if c.description_improved:
            text_sim = max(text_sim, compute_text_similarity(description, c.description_improved))

        # 2. Location similarity
        loc_score = 0.0
        dist_km = None
        if latitude is not None and longitude is not None and c.latitude is not None and c.longitude is not None:
            dist_km = haversine_distance(latitude, longitude, c.latitude, c.longitude)
            if dist_km <= 0.35:  # within 350 meters
                loc_score = max(0.5, 1.0 - (dist_km / 0.35))
        
        # Location text overlap
        loc_text_sim = compute_text_similarity(location_text, c.location_text)
        loc_score = max(loc_score, loc_text_sim)

        # 3. Photo/media factor
        photo_factor = 0.1 if (photo_name or (c.evidence_files and len(c.evidence_files) > 0)) else 0.0

        # Preliminary combined score
        combined_prelim = (text_sim * 0.5) + (loc_score * 0.4) + photo_factor
        scored_candidates.append((c, combined_prelim, text_sim, loc_score, dist_km))

    scored_candidates.sort(key=lambda x: x[1], reverse=True)
    top_candidates = [cand for cand in scored_candidates if cand[1] >= 0.15]

    if not top_candidates:
        return None

    # Evaluate best candidate with Gemma AI
    best_candidate, prelim_score, text_sim, loc_score, dist_km = top_candidates[0]

    system_prompt = (
        "You are Gemma AI assisting in municipal complaint organization and deduplication.\n"
        "Analyze whether the NEW citizen post describes the SAME problem/incident at the SAME location "
        "as an EXISTING post under the same category.\n"
        "Consider text details, photos/evidence, and location.\n"
        "If they refer to the same physical issue, return is_match=true with a clear factual reason."
    )

    photo_context = f"New post photo attached: {photo_name}" if photo_name else "No photo attached on new post"
    existing_photo_context = (
        f"{len(best_candidate.evidence_files)} photos on record"
        if best_candidate.evidence_files
        else "No photos on existing record"
    )

    dist_str = f"Approx {round(dist_km * 1000)} meters apart" if dist_km is not None else "Coordinates not both available"
    prompt = (
        f"Category: {category_name}\n\n"
        f"NEW POST:\n"
        f"- Description: {description.strip()}\n"
        f"- Location: {location_text.strip()} ({latitude}, {longitude})\n"
        f"- Media Context: {photo_context}\n\n"
        f"EXISTING POST (#{best_candidate.public_reference_number}):\n"
        f"- Description: {best_candidate.description_original.strip()}\n"
        f"- Location: {best_candidate.location_text.strip()} ({best_candidate.latitude}, {best_candidate.longitude})\n"
        f"- Distance / Proximity: {dist_str}\n"
        f"- Media Context: {existing_photo_context}"
    )

    res_dict = None
    latency_ms = 0
    status = "ERROR"

    for _ in range(settings.AI_MAX_RETRIES + 1):
        res_dict, latency_ms, status = await provider.generate_json(
            prompt=prompt,
            system_prompt=system_prompt,
            schema_class=AiSimilarityCheckOutput,
            timeout_seconds=settings.AI_TIMEOUT_SECONDS,
        )
        if status == "SUCCESS" and res_dict:
            break

    log_ai_call(db, organization_id, "complaint-similarity-check", provider.model_name, status, latency_ms, len(prompt))

    if res_dict and res_dict.get("is_match") is True:
        reason = res_dict.get(
            "reason",
            f"Gemma AI identified overlapping issue description, location ({best_candidate.location_text}), and photo context."
        )
        score = float(res_dict.get("similarity_score", prelim_score))
        return best_candidate, reason, score

    # Fallback heuristic: If high text overlap AND very close location
    if (text_sim >= 0.40 and loc_score >= 0.50) or (text_sim >= 0.55 and loc_score >= 0.25):
        reason = (
            f"High text similarity ({round(text_sim * 100)}%) and matching location "
            f"({best_candidate.location_text}) identified under {category_name}."
        )
        return best_candidate, reason, prelim_score

    return None
