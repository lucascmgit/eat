import re
import json
import base64
import httpx
import trafilatura
import anthropic
from dotenv import load_dotenv

load_dotenv()

client = anthropic.Anthropic()

_SYSTEM = """\
You are a recipe extraction and translation assistant for a Brazilian cookbook app.

Rules:
1. Extract ONLY recipe data — ingredients with quantities and preparation steps.
   Ignore blog prose, personal stories, SEO content, tips, comments, ads.
2. Translate everything to Brazilian Portuguese (PT-BR) if not already.
3. Convert imperial units to metric:
   - oz → grams (1 oz = 28 g, round to nearest gram)
   - lb/pounds → grams (1 lb = 454 g)
   - fl oz → ml (1 fl oz = 30 ml)
   - Fahrenheit → Celsius: (F−32)×5/9, round to nearest 5°C
   - Keep as-is: cups (xícaras), tablespoons (colheres de sopa), teaspoons (colheres de chá)
4. Return ONLY a valid JSON object — no markdown fences, no commentary.\
"""

_SCHEMA = """\
{
  "title": "Recipe title in PT-BR",
  "servings": "e.g. '4 porções' — or null",
  "tipo": "salgado | doce | bebida",
  "ingredients": [
    {"quantity": "450 g",              "item": "cogumelos paris frescos"},
    {"quantity": "2 colheres de sopa", "item": "manteiga"},
    {"quantity": "a gosto",            "item": "sal"}
  ],
  "instructions": [
    "Primeiro passo como frase completa.",
    "Segundo passo."
  ],
  "image_url": "https://... or null"
}\
"""


_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def _fetch(url: str) -> tuple:
    import time
    for attempt in range(3):
        r = httpx.get(url, headers=_HEADERS, follow_redirects=True, timeout=20)
        if r.status_code == 429:
            time.sleep(4 * (attempt + 1))
            continue
        break
    if r.status_code == 429:
        raise ValueError(f"O site bloqueou a requisição (429). Tente novamente em alguns segundos.")
    if r.status_code == 403:
        raise ValueError(f"Acesso negado pelo site (403). Este site pode bloquear leitores automáticos.")
    r.raise_for_status()
    html = r.text

    text = trafilatura.extract(html, include_images=False, include_links=False) or ""

    image_url = None

    # og:image — match only the exact property, not og:image:alt etc.
    for pattern in [
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
    ]:
        m = re.search(pattern, html, re.IGNORECASE)
        if m and m.group(1).startswith("http"):
            image_url = m.group(1)
            break

    if not image_url:
        # fallback: first image URL found in the HTML
        m = re.search(
            r'https?://[^\s"\'<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"\'<>]*)?',
            html, re.IGNORECASE
        )
        if m:
            image_url = m.group(0)

    return text, image_url


def extract_recipe(url: str) -> dict:
    text, image_url = _fetch(url)

    prompt = f"""\
URL: {url}
Detected image: {image_url or "none"}

Page content:
{text}

Extract the recipe and return JSON matching this structure exactly:
{_SCHEMA}

Notes:
- ingredients[].quantity: measurement + unit only (e.g. "2 colheres de sopa", "450 g", "3", "a gosto")
- ingredients[].item: ingredient name only, no quantities
- instructions: each element is one complete step, translated to PT-BR
- tipo: "salgado" for savory food, "doce" for desserts/sweets, "bebida" for drinks
- image_url: use the detected image URL if it looks like a food photo, otherwise null\
"""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=[{"type": "text", "text": _SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    data = json.loads(raw)
    data["source_url"] = url
    if not data.get("image_url") or data["image_url"] == "null":
        data["image_url"] = image_url

    return data


def extract_from_image(image_data: bytes, media_type: str) -> dict:
    b64 = base64.standard_b64encode(image_data).decode("utf-8")

    prompt = f"""\
The attached image shows a recipe from a cookbook or handwritten note.

Extract the recipe and return JSON matching this structure exactly:
{_SCHEMA}

Notes:
- ingredients[].quantity: measurement + unit only (e.g. "2 colheres de sopa", "450 g", "3", "a gosto")
- ingredients[].item: ingredient name only, no quantities
- instructions: each element is one complete step, translated to PT-BR
- tipo: "salgado" for savory food, "doce" for desserts/sweets, "bebida" for drinks
- image_url: null\
"""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=[{"type": "text", "text": _SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
                {"type": "text", "text": prompt},
            ],
        }],
    )

    raw = message.content[0].text.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    data = json.loads(raw)
    data["source_url"] = "foto de livro"
    data["image_url"] = None
    return data


def extract_from_text(text: str, source_url: str = "") -> dict:
    prompt = f"""\
The following is recipe text pasted directly by the user (may be in any language):

{text}

Extract the recipe and return JSON matching this structure exactly:
{_SCHEMA}

Notes:
- ingredients[].quantity: measurement + unit only (e.g. "2 colheres de sopa", "450 g", "3", "a gosto")
- ingredients[].item: ingredient name only, no quantities
- instructions: each element is one complete step, translated to PT-BR
- tipo: "salgado" for savory food, "doce" for desserts/sweets, "bebida" for drinks
- image_url: null (no image available from pasted text)\
"""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=[{"type": "text", "text": _SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    data = json.loads(raw)
    data["source_url"] = source_url or "texto colado"
    data["image_url"] = None

    return data
