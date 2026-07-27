import requests

from config import OPENROUTER_API_KEY, OPENROUTER_MODEL

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def chat(system: str, user: str, model: str = None, temperature: float = 0.3) -> str:
    """Single-turn chat completion via OpenRouter. Returns the assistant's text."""
    resp = requests.post(
        OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://clearscopecounsel.com",
            "X-Title": "ClearScope Regulatory Tracker Agent",
        },
        json={
            "model": model or OPENROUTER_MODEL,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        },
        timeout=90,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"].strip()
