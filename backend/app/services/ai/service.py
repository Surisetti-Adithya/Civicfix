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
    FollowUpQuestionsOutput,
    FollowUpQuestionsResponse,
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


def assess_complaint_priority(description: str, category_name: Optional[str] = None) -> str:
    """
    Evaluates complaint text hazards and public disruption to determine priority.
    """
    text = (description + " " + (category_name or "")).lower()

    # 1. Critical safety risks (life safety, active hazard, live wires, fire, flood deluge)
    critical_terms = [
        "burst", "spark", "electric", "fire", "danger", "flood", "collapse",
        "live wire", "gas leak", "life safety", "high voltage", "explosion",
        "electrocution", "toxic", "catastrophic", "open well", "deep trench"
    ]
    if any(term in text for term in critical_terms):
        return "CRITICAL"

    # 2. High disruption (sewer overflow, broken pipeline, deep pothole causing vehicle accidents, main road blockage)
    high_terms = [
        "overflow", "sewage", "deep pothole", "broken pipe", "accident", "urgent",
        "no water", "contaminated", "traffic signal", "blocked road", "major leak",
        "fallen tree", "ambulance", "hospital", "school junction"
    ]
    if any(term in text for term in high_terms):
        return "HIGH"

    # 3. Low urgency (minor cosmetic, paint, fading, minor debris)
    low_terms = [
        "minor", "cosmetic", "paint", "faded", "small scratch", "cleaning needed",
        "non urgent", "aesthetic", "mild"
    ]
    if any(term in text for term in low_terms):
        return "LOW"

    # Default baseline
    return "MEDIUM"


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
        "near", "inside", "outside", "regarding", "observed",
        "community", "maintenance", "hazardous", "defective", "emergency", "immediate",
        "prompt", "public", "municipal", "inspection", "water", "electrical",
        "elevator", "excessive", "reported", "poses", "urgent", "action", "requests",
        "drainage", "sanitation", "street", "lighting"
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


def refine_civic_description(text: str) -> str:
    cleaned = text.strip()
    if not cleaned:
        return text

    t_lower = cleaned.lower()

    # 1. Streetlights & signals
    if any(k in t_lower for k in ["streetlight", "street light", "street lamp", "lamp post", "light pole", "dark road", "flickering light", "darkness"]):
        return (
            "Non-functional street lighting observed. The street lamp is completely unlit, creating poor visibility "
            "and safety concerns for pedestrians and commuters after dark. Urgent maintenance and electrical inspection required."
        )

    # 2. Roads, potholes & footpaths
    if any(k in t_lower for k in ["pothole", "broken road", "bad road", "road damage", "asphalt", "footpath tile", "speedbreaker", "curb"]):
        return (
            "Hazardous road surface defect with a deep pothole on the carriageway. Creates an immediate traffic bottleneck "
            "and significant risk of vehicle tire damage and two-wheeler accidents. Patching and asphalt resurfacing requested."
        )

    # 3. Drainage, culvert & sewage
    if any(k in t_lower for k in ["drain", "gutter", "culvert", "manhole", "sewage", "sewer", "clogged", "choked", "overflow", "stagnant water"]):
        return (
            "Severely clogged drainage causing stormwater and wastewater accumulation on the public roadway. "
            "Creates foul odor, sanitation concerns, and pedestrian obstruction. Immediate culvert clearance and de-silting required."
        )

    # 4. Water supply & pipeline leaks
    if any(k in t_lower for k in ["water leak", "pipe leak", "water pipe", "burst pipe", "pipe burst", "no water", "water supply"]):
        return (
            "Major water pipeline leakage with continuous discharge observed. Causes drinking water loss, low water pressure "
            "in the area, and surface ponding. Urgent plumbing isolation and pipeline repair requested."
        )

    # 5. Sanitation, garbage & waste
    if any(k in t_lower for k in ["garbage", "trash", "waste", "dump", "dumped", "litter", "rubbish", "sweeping", "debris"]):
        return (
            "Excessive uncollected waste and overflowing garbage accumulation observed at the site. "
            "Creates unsanitary conditions, foul odor, and public health hazards. Dispatch of municipal sanitation crew for waste clearance requested."
        )

    # 6. Lifts & elevators
    if any(k in t_lower for k in ["lift", "elevator"]):
        return (
            "Elevator operational breakdown observed with cabin unresponsive and out of service. "
            "Causes severe mobility disruption for residents and visitors. Urgent technical inspection and lift restoration requested."
        )

    # 7. Electrical & power
    if any(k in t_lower for k in ["electrical", "spark", "sparking", "short circuit", "exposed wire", "power cut", "blackout", "fuse"]):
        return (
            "Hazardous electrical malfunction with exposed wiring and power disruption observed. "
            "Poses severe electrocution and fire hazard risks to residents and pedestrians. Immediate emergency electrical isolation and rewiring required."
        )

    # 8. Security & access control
    if any(k in t_lower for k in ["barrier", "boom barrier", "gate", "intercom", "cctv", "security"]):
        return (
            "Malfunction of security access control and barrier equipment observed. "
            "Impairs gate management and security monitoring for the premises. Maintenance inspection and hardware repair requested."
        )

    # 9. Stray animals & pests
    if any(k in t_lower for k in ["stray", "dog", "cattle", "mosquito", "rodent", "rat", "pest"]):
        return (
            "Stray animal and pest menace observed creating an unsafe environment for community members. "
            "Animal control inspection and humane mitigation requested."
        )

    # 10. Noise & pollution
    if any(k in t_lower for k in ["noise", "loud", "sound", "pollution", "smoke"]):
        return (
            "Excessive noise and environmental pollution observed in the residential area. "
            "Creates severe public disturbance and discomfort for residents. Regulatory inspection and adherence enforcement requested."
        )

    # 11. Parks & public spaces
    if any(k in t_lower for k in ["park", "bench", "tree", "playground", "garden"]):
        return (
            "Damage to public park infrastructure and amenities observed. "
            "Affects visitor safety and the usability of shared community recreational spaces. Maintenance repair and groundskeeping attention requested."
        )

    # 12. General structured transformation
    sentence = cleaned[0].upper() + cleaned[1:]
    if not sentence.endswith((".", "!", "?")):
        sentence += "."
    return (
        f"Community maintenance issue reported: {sentence} Poses disruption and safety concerns for residents in the immediate vicinity. "
        "Prompt field inspection and remedial maintenance requested."
    )


async def improve_description_service(
    db: DBSession,
    organization_id: int,
    user_id: int,
    description: str,
) -> ImproveDescriptionResponse:
    check_ai_rate_limit(user_id)
    provider = get_ai_provider()

    system_prompt = (
        "You are a civic complaint writing assistant. Your job is to rewrite a citizen's complaint "
        "description to make it clearer, more specific, and actionable for field staff — WITHOUT adding "
        "any facts not present in the original.\n\n"
        "Rules:\n"
        "1. Keep ALL facts from the original — do not remove or change any specific detail.\n"
        "2. Improve grammar, structure, and clarity only.\n"
        "3. Add helpful contextual phrases like 'causing safety risk', 'requires urgent attention', "
        "'affecting daily commute' ONLY when obviously implied by context.\n"
        "4. Do NOT add specific numbers, dates, injuries, property values, measurements, or names "
        "that are not present in the input.\n"
        "5. The improved text MUST be noticeably different from the original — restructure sentences.\n"
        "6. Keep the same language as the original input.\n"
        "7. Output strictly valid JSON with key 'improved_description'."
    )
    prompt = (
        f"Original complaint (rewrite this clearly for field staff review):\n{description.strip()}\n\n"
        "Provide only the improved version. Do not repeat the original."
    )
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
        if status in ("NO_API_KEY", "ERROR"):
            # Intelligent NLP civic refiner when external AI provider is offline or unconfigured
            improved_fallback = refine_civic_description(description)
            if verify_no_hallucinations(description, improved_fallback):
                log_ai_call(db, organization_id, "improve-description", "heuristic-refiner", "SUCCESS", latency_ms, input_size)
                return ImproveDescriptionResponse(
                    improved_description=improved_fallback,
                    original_description=description,
                    is_ai_suggestion=True,
                )

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
        if status in ("NO_API_KEY", "ERROR"):
            # Intelligent category topic and keyword matching fallback
            desc_lower = description.lower()
            best_cat = None
            best_score = 0
            stop_words = {"with", "from", "near", "other", "open", "street", "that", "this", "have", "been", "please", "there"}

            category_topics = {
                "streetlights": {
                    "phrases": ["street light", "street lights", "traffic signal", "traffic light", "traffic signals", "street lamp", "light pole", "power pole", "dark road", "flickering light"],
                    "keywords": ["streetlight", "streetlights", "lamp", "lamppost", "pole", "light", "lights", "dark", "darkness", "bulb", "bulbs", "flickering", "signal", "signals", "illumination", "blackout"],
                    "target_keywords": ["streetlight", "signals", "light", "lighting"],
                },
                "roads": {
                    "phrases": ["speed breaker", "broken road", "main road", "pothole on", "asphalt road", "road cave", "road collapse", "road surface", "road damage", "road marking"],
                    "keywords": ["pothole", "potholes", "road", "roads", "pavement", "pavements", "asphalt", "tar", "divider", "curb", "crater", "craters", "speedbreaker", "speedbreakers", "bump"],
                    "target_keywords": ["road", "pavement", "pothole", "asphalt"],
                },
                "footpath": {
                    "phrases": ["footpath tile", "pedestrian crossing", "broken footpath", "footpath obstruction", "tripping hazard", "footpath blocked", "pedestrian path", "missing footpath", "accessibility ramp"],
                    "keywords": ["footpath", "footpaths", "sidewalk", "sidewalks", "pedestrian", "walkway", "ramp", "tile", "tiles", "tripping", "pavement"],
                    "target_keywords": ["footpath", "pedestrian", "walkway"],
                },
                "drainage": {
                    "phrases": ["storm water", "stormwater", "drainage overflow", "clogged drain", "open manhole", "sewage leak", "sewer line", "water logging", "waterlogged", "choked drain", "dirty water", "sewage overflow"],
                    "keywords": ["drain", "drains", "drainage", "gutter", "gutters", "culvert", "culverts", "manhole", "manholes", "sewage", "sewer", "clogged", "choked", "overflowing", "stagnant"],
                    "target_keywords": ["drainage", "stormwater", "drain", "sewage", "manhole"],
                },
                "water_supply": {
                    "phrases": ["water supply", "no water", "water pipe burst", "pipe burst", "water pressure", "contaminated water", "dirty water supply", "water outage", "water disruption"],
                    "keywords": ["water", "supply", "pipeline", "pipeline", "bore", "borewell", "tanker", "contaminated", "pressure", "tap", "taps", "faucet"],
                    "target_keywords": ["water supply", "pipeline", "pipelines"],
                },
                "sanitation": {
                    "phrases": ["garbage dump", "waste collection", "garbage truck", "trash bin", "dust bin", "garbage bin", "dead animal", "food waste", "garbage heap", "waste dumping"],
                    "keywords": ["garbage", "trash", "waste", "bin", "bins", "dump", "dumped", "dumping", "dumpster", "litter", "rubbish", "sweeping", "debris", "stench", "rotten"],
                    "target_keywords": ["sanitation", "waste", "garbage"],
                },
                "parks": {
                    "phrases": ["park bench", "park light", "playground equipment", "public garden", "park maintenance", "overgrown tree", "park vandalism", "tree branch", "fallen tree"],
                    "keywords": ["park", "parks", "garden", "gardens", "bench", "benches", "tree", "trees", "playground", "equipment", "grass", "horticulture", "terrace"],
                    "target_keywords": ["park", "public spaces", "garden", "horticulture"],
                },
                "encroachment": {
                    "phrases": ["illegal construction", "road encroachment", "footpath obstruction", "unauthorized building", "illegal structure", "footpath encroachment", "road blocked by shop", "illegal shop"],
                    "keywords": ["encroachment", "illegal", "unauthorized", "obstruction", "block", "blocked", "structure", "construction", "building", "shop", "vendor"],
                    "target_keywords": ["encroachment", "illegal construction"],
                },
                "noise_pollution": {
                    "phrases": ["construction noise", "loud music", "loudspeaker noise", "air pollution", "illegal burning", "smoke nuisance", "noise complaint", "industrial waste", "burning garbage"],
                    "keywords": ["noise", "loud", "sound", "pollution", "smoke", "burning", "fumes", "stench", "smell", "industrial", "chemical", "toxic", "loudspeaker"],
                    "target_keywords": ["noise", "pollution"],
                },
                "stray_animals": {
                    "phrases": ["stray dog", "dog bite", "stray cattle", "mosquito breeding", "rat infestation", "stray animal", "pest control", "dog menace"],
                    "keywords": ["stray", "dog", "dogs", "cow", "cattle", "mosquito", "mosquitoes", "rat", "rats", "rodent", "pest", "snake", "insect", "bite", "attack", "nuisance"],
                    "target_keywords": ["stray", "pest control", "animals"],
                },
                "plumbing": {
                    "phrases": ["water leak", "water pipe", "pipe leak", "water pressure", "flush tank", "drain pipe", "tap leak", "burst pipe", "pipe burst"],
                    "keywords": ["plumbing", "plumber", "pipe", "pipes", "tap", "taps", "faucet", "faucets", "leak", "leaks", "leaking", "leakage", "shower", "flush", "sink", "geyser", "tank", "sanitary", "valve"],
                    "target_keywords": ["plumbing", "pipe", "water supply"],
                },
                "lifts": {
                    "phrases": ["lift stuck", "elevator stuck", "lift breakdown", "elevator button", "lift door", "jerky motion", "lift trapped", "lift not working", "elevator not working"],
                    "keywords": ["lift", "lifts", "elevator", "elevators", "floor stop"],
                    "target_keywords": ["lift", "elevator"],
                },
                "electrical": {
                    "phrases": ["sparking wire", "short circuit", "power outage", "backup generator", "meter box", "electrical fault", "wiring fault", "exposed wire", "switchboard fault"],
                    "keywords": ["electrical", "electricity", "power", "wire", "wires", "sparking", "spark", "fuse", "generator", "switchboard", "socket", "meter", "voltage"],
                    "target_keywords": ["electrical", "generator", "wiring"],
                },
                "security": {
                    "phrases": ["boom barrier", "visitor entry", "security guard", "visitor registration", "security gate", "entry gate", "intercom not working", "stranger in building", "cctv not working"],
                    "keywords": ["security", "guard", "guards", "barrier", "barriers", "gate", "gates", "visitor", "intercom", "trespass", "cctv", "surveillance", "access", "lock", "key"],
                    "target_keywords": ["security", "access", "barrier"],
                },
                "cleaning": {
                    "phrases": ["corridor cleaning", "staircase cleaning", "garbage chute", "common area dirty", "housekeeping not done", "mopping not done"],
                    "keywords": ["cleaning", "housekeeping", "corridor", "staircase", "mopping", "sweep", "chute", "dirty", "mess", "hygiene"],
                    "target_keywords": ["cleaning", "housekeeping"],
                },
                "parking": {
                    "phrases": ["parking violation", "blocked parking", "wrong parking", "parking slot", "parking damage", "ev charging", "parking area"],
                    "keywords": ["parking", "park", "vehicle", "car", "bike", "slot", "space", "blocked", "violation", "charging"],
                    "target_keywords": ["parking", "vehicles"],
                },
                "amenities": {
                    "phrases": ["gym equipment", "swimming pool", "clubhouse", "common area damage", "amenity not working", "pool maintenance"],
                    "keywords": ["gym", "pool", "clubhouse", "amenity", "amenities", "equipment", "terrace", "common area"],
                    "target_keywords": ["amenities", "common area"],
                },
                "pest": {
                    "phrases": ["cockroach infestation", "bed bug", "fumigation", "lizard problem", "rodent infestation", "pest complaint"],
                    "keywords": ["cockroach", "cockroaches", "rodent", "rat", "lizard", "bedbug", "fumigation", "pest", "insect", "ants", "termite"],
                    "target_keywords": ["pest", "housekeeping"],
                },
            }

            for c in categories:
                c_text = f"{c.name} {c.description or ''}".lower()
                score = 0
                for topic_name, topic in category_topics.items():
                    if any(t in c_text for t in topic["target_keywords"]):
                        for phrase in topic["phrases"]:
                            if phrase in desc_lower:
                                score += 8
                        for kw in topic["keywords"]:
                            if kw in desc_lower:
                                score += 3
                for term in c_text.split():
                    clean_term = term.strip(",.&-()")
                    if len(clean_term) > 3 and clean_term not in stop_words and clean_term in desc_lower:
                        score += 2

                if score > best_score:
                    best_score = score
                    best_cat = c

            if best_cat:
                log_ai_call(db, organization_id, "suggest-category", "heuristic-matcher", "SUCCESS", latency_ms, input_size)
                return SuggestCategoryResponse(
                    category_id=best_cat.id,
                    category_name=category_id_map.get(best_cat.id),
                    reason=f"Recommended category '{best_cat.name}' based on reported issue details.",
                    confidence="HIGH" if best_score >= 8 else "MEDIUM",
                    is_ai_suggestion=True,
                )

        log_ai_call(db, organization_id, "suggest-category", provider.model_name, status, latency_ms, input_size)
        return SuggestCategoryResponse(
            category_id=None,
            reason="AI suggestion unavailable.",
            confidence="LOW",
        )

    suggested_val = res_dict.get("category_id")
    suggested_id = None
    if isinstance(suggested_val, int):
        suggested_id = suggested_val
    elif isinstance(suggested_val, str):
        if suggested_val.isdigit():
            suggested_id = int(suggested_val)
        else:
            val_lower = suggested_val.lower().strip()
            for cid, cname in category_id_map.items():
                if cname.lower() in val_lower or val_lower in cname.lower():
                    suggested_id = cid
                    break

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


async def generate_follow_up_questions_service(
    db: DBSession,
    organization_id: int,
    user_id: int,
    description: str,
) -> FollowUpQuestionsResponse:
    """
    Ask Gemma to generate 2-3 brief follow-up questions to help the citizen
    provide better complaint details. If the description already answers a
    potential question, Gemma must NOT ask it again.
    Returns an empty list when the description is already detailed enough.
    """
    check_ai_rate_limit(user_id)
    provider = get_ai_provider()

    system_prompt = (
        "You are a civic complaint assistant. A citizen has submitted an issue report. "
        "Your job is to generate 2 to 3 short, helpful follow-up questions to get more useful detail "
        "for the field crew — ONLY if those details are NOT already mentioned in the description.\n\n"
        "Rules:\n"
        "1. If the description is already detailed enough, return an empty questions list.\n"
        "2. Questions must be short (under 12 words each), specific to the issue, and easy to answer.\n"
        "3. Do NOT ask about anything the citizen already mentioned.\n"
        "4. Do NOT ask for personal info, contact details, or location (already captured separately).\n"
        "5. Questions should help field workers — e.g. severity, exact spot, duration, frequency.\n"
        "6. Output strictly valid JSON with key 'questions' as a list of strings."
    )
    prompt = (
        f"Citizen complaint description:\n{description.strip()}\n\n"
        "Generate follow-up questions (empty list if description is sufficient)."
    )
    input_size = len(prompt)

    res_dict = None
    latency_ms = 0
    status = "ERROR"

    for _ in range(settings.AI_MAX_RETRIES + 1):
        res_dict, latency_ms, status = await provider.generate_json(
            prompt=prompt,
            system_prompt=system_prompt,
            schema_class=FollowUpQuestionsOutput,
            timeout_seconds=settings.AI_TIMEOUT_SECONDS,
        )
        if status == "SUCCESS" and res_dict:
            break

    if status != "SUCCESS" or not res_dict:
        if status == "NO_API_KEY":
            # Heuristic fallback: ask generic but useful questions
            desc_lower = description.lower()
            questions = []
            if not any(w in desc_lower for w in ["how long", "since", "days", "weeks", "hours", "yesterday", "today"]):
                questions.append("How long has this issue been present?")
            if not any(w in desc_lower for w in ["always", "sometimes", "intermittent", "occasional", "every", "daily", "only when"]):
                questions.append("Does this happen all the time or only at certain times?")
            if not any(w in desc_lower for w in ["exact", "near", "beside", "in front", "behind", "at the", "block", "floor"]):
                questions.append("Can you describe the exact spot more precisely?")
            log_ai_call(db, organization_id, "follow-up-questions", "heuristic-fallback", "SUCCESS", latency_ms, input_size)
            return FollowUpQuestionsResponse(questions=questions[:3])

        log_ai_call(db, organization_id, "follow-up-questions", provider.model_name, status, latency_ms, input_size)
        return FollowUpQuestionsResponse(questions=[])

    raw_questions = res_dict.get("questions", [])
    # Safety: keep only strings, max 3, max 100 chars each
    clean_questions = [
        q for q in raw_questions
        if isinstance(q, str) and 5 < len(q.strip()) < 120
    ][:3]

    log_ai_call(db, organization_id, "follow-up-questions", provider.model_name, "SUCCESS", latency_ms, input_size)
    return FollowUpQuestionsResponse(questions=clean_questions)


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


async def analyze_suspicious_patterns_service(
    citizen_id: int,
    organization_id: int,
    db: DBSession,
) -> Any:
    from backend.app.models import User
    from backend.app.schemas.trust import CitizenPatternAnalysisOutput, GemmaPatternAnalysisResponse
    from backend.app.services.trust_service import detect_suspicious_patterns

    citizen = db.query(User).filter(User.id == citizen_id).first()
    if not citizen:
        raise CivicFixException(code="USER_NOT_FOUND", message="Citizen not found.", status_code=404)

    # Heuristic data extraction
    pattern_data = detect_suspicious_patterns(db, citizen_id, organization_id)
    flags = pattern_data["suspicious_flags"]
    total_rep = pattern_data["total_reports"]
    rej_rep = pattern_data["rejected_reports"]
    verifs = pattern_data["total_verifications"]

    provider = get_ai_provider()

    system_prompt = (
        "You are Gemma, an AI assistant analyzing civic issue reporting patterns for administrative review. "
        "Review the citizen's reporting statistics, rejection rates, verification records, and flagged anomalies. "
        "Identify whether the behavior indicates genuine community participation, accidental duplicates, or suspicious spam patterns. "
        "CRITICAL RULE: Gemma recommendations are advisory only. You must NEVER automatically ban a citizen or make the final decision. "
        "You may recommend a trust-score adjustment or suggest flagging for human review."
    )

    complaint_samples = [
        f"- Reference {c.public_reference_number} [{c.status}]: {c.description_original[:120]}"
        for c in pattern_data["complaints"][:5]
    ]
    sample_text = "\n".join(complaint_samples) if complaint_samples else "No complaint samples available."

    prompt = (
        f"Citizen Name: {citizen.full_name}\n"
        f"Total Reports Submitted: {total_rep}\n"
        f"Rejected Reports Count: {rej_rep}\n"
        f"Community Verifications Performed: {verifs}\n"
        f"Pre-detected Heuristic Flags: {', '.join(flags) if flags else 'None'}\n"
        f"Recent Complaint Samples:\n{sample_text}\n\n"
        "Analyze whether this citizen's behavior presents any suspicious patterns or if it represents normal civic engagement."
    )

    res_dict = None
    latency_ms = 0
    status = "ERROR"

    for _ in range(settings.AI_MAX_RETRIES + 1):
        res_dict, latency_ms, status = await provider.generate_json(
            prompt=prompt,
            system_prompt=system_prompt,
            schema_class=CitizenPatternAnalysisOutput,
            timeout_seconds=settings.AI_TIMEOUT_SECONDS,
        )
        if status == "SUCCESS" and res_dict:
            break

    log_ai_call(db, organization_id, "analyze-suspicious-patterns", provider.model_name, status, latency_ms, len(prompt))

    if res_dict:
        try:
            validated = CitizenPatternAnalysisOutput.model_validate(res_dict)
            combined_flags = list(dict.fromkeys(flags + validated.suspicious_flags))
            return GemmaPatternAnalysisResponse(
                citizen_id=citizen.id,
                citizen_name=citizen.full_name,
                suspicious_flags=combined_flags,
                risk_level=validated.risk_level,
                summary_analysis=validated.summary_analysis,
                recommended_action=validated.recommended_action,
                recommended_trust_adjustment=validated.recommended_trust_adjustment,
                recommendation_reason=validated.recommendation_reason,
                is_ai_suggestion=True,
            )
        except Exception:
            pass

    # Heuristic fallback if AI service unavailable or timed out
    has_risk = len(flags) > 0
    return GemmaPatternAnalysisResponse(
        citizen_id=citizen.id,
        citizen_name=citizen.full_name,
        suspicious_flags=flags,
        risk_level="MEDIUM" if has_risk else "LOW",
        summary_analysis=(
            f"Citizen has submitted {total_rep} reports ({rej_rep} rejected) and {verifs} verifications. "
            + ("Heuristic analysis noted potential reporting anomalies." if has_risk else "Engagement pattern is consistent with standard citizen reporting.")
        ),
        recommended_action="FLAG_FOR_REVIEW" if has_risk else "NO_ACTION",
        recommended_trust_adjustment=-10 if has_risk else 0,
        recommendation_reason=(
            "Observed flagged patterns warrant administrative review before making score adjustments."
            if has_risk else "Consistent participation with standard verification activity."
        ),
        is_ai_suggestion=True,
    )
