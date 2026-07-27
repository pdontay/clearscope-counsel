import sys

import requests

from config import OPENROUTER_API_KEY, PRIMARY_MODEL, SECONDARY_MODEL

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def _call(model: str, system: str, user: str, temperature: float) -> str:
    resp = requests.post(
        OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://clearscopecounsel.com",
            "X-Title": "ClearScope Regulatory Tracker Agent",
        },
        json={
            "model": model,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        },
        timeout=90,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


def chat(system: str, user: str, model: str = None, temperature: float = 0.3) -> str:
    """Single-turn chat completion via OpenRouter. If `model` is omitted, tries
    PRIMARY_MODEL first and falls back to SECONDARY_MODEL on any failure
    (rate limit, outage, a model slug getting deprecated out from under us)."""
    if model:
        return _call(model, system, user, temperature)

    try:
        return _call(PRIMARY_MODEL, system, user, temperature)
    except Exception as exc:
        print(f"[llm] primary model {PRIMARY_MODEL} failed ({exc}); falling back to {SECONDARY_MODEL}", file=sys.stderr)
        return _call(SECONDARY_MODEL, system, user, temperature)
