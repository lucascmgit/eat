import sqlite3
import json
import re
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

DB_PATH = Path(__file__).parent / "recipes.db"

VALID_TIPO   = {"salgado", "doce", "bebida"}
VALID_STATUS = {"quero_fazer", "ja_fiz"}


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS recipes (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                title        TEXT NOT NULL,
                slug         TEXT UNIQUE NOT NULL,
                source_url   TEXT NOT NULL,
                servings     TEXT,
                ingredients  TEXT NOT NULL,
                instructions TEXT NOT NULL,
                image_url    TEXT,
                created_at   TEXT NOT NULL,
                tipo         TEXT NOT NULL DEFAULT 'salgado',
                status       TEXT NOT NULL DEFAULT 'quero_fazer'
            )
        """)
        # migrate existing DBs that lack the new columns
        for col, default in [("tipo", "salgado"), ("status", "quero_fazer")]:
            try:
                conn.execute(f"ALTER TABLE recipes ADD COLUMN {col} TEXT NOT NULL DEFAULT '{default}'")
            except Exception:
                pass
        conn.commit()


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def save_recipe(data: dict) -> dict:
    with get_db() as conn:
        slug_base = slugify(data["title"])
        slug = slug_base
        i = 1
        while conn.execute("SELECT id FROM recipes WHERE slug = ?", (slug,)).fetchone():
            slug = f"{slug_base}-{i}"
            i += 1

        tipo = data.get("tipo", "salgado")
        if tipo not in VALID_TIPO:
            tipo = "salgado"

        conn.execute(
            """
            INSERT INTO recipes
              (title, slug, source_url, servings, ingredients, instructions, image_url, created_at, tipo, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'quero_fazer')
            """,
            (
                data["title"],
                slug,
                data["source_url"],
                data.get("servings") or "",
                json.dumps(data["ingredients"], ensure_ascii=False),
                json.dumps(data["instructions"], ensure_ascii=False),
                data.get("image_url"),
                datetime.now().isoformat(),
                tipo,
            ),
        )
        conn.commit()
    return get_recipe_by_slug(slug)


def update_recipe(slug: str, fields: dict) -> Optional[dict]:
    allowed = {}
    if "status" in fields and fields["status"] in VALID_STATUS:
        allowed["status"] = fields["status"]
    if "tipo" in fields and fields["tipo"] in VALID_TIPO:
        allowed["tipo"] = fields["tipo"]
    if "image_url" in fields:
        url = fields["image_url"] or ""
        if url == "" or url.startswith("/images/") or url.startswith("http://") or url.startswith("https://"):
            allowed["image_url"] = url or None
    if "title" in fields and isinstance(fields["title"], str) and fields["title"].strip():
        allowed["title"] = fields["title"].strip()
    if "servings" in fields and isinstance(fields["servings"], str):
        allowed["servings"] = fields["servings"].strip()
    if "ingredients" in fields and isinstance(fields["ingredients"], list):
        allowed["ingredients"] = json.dumps(fields["ingredients"], ensure_ascii=False)
    if "instructions" in fields and isinstance(fields["instructions"], list):
        allowed["instructions"] = json.dumps(fields["instructions"], ensure_ascii=False)
    if not allowed:
        return get_recipe_by_slug(slug)

    set_clause = ", ".join(f"{k} = ?" for k in allowed)
    with get_db() as conn:
        conn.execute(
            f"UPDATE recipes SET {set_clause} WHERE slug = ?",
            (*allowed.values(), slug),
        )
        conn.commit()
    return get_recipe_by_slug(slug)


def get_sources() -> list:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT DISTINCT source_url FROM recipes "
            "WHERE source_url NOT IN ('', 'texto colado', 'foto de livro')"
        ).fetchall()
    seen, result = set(), []
    for row in rows:
        try:
            host = urlparse(row["source_url"]).hostname or ""
            host = re.sub(r"^www\.", "", host)
            if host and host not in seen:
                seen.add(host)
                result.append(host)
        except Exception:
            pass
    return sorted(result)


def get_all_recipes(tipo: str = "", status: str = "", source: str = "") -> list:
    with get_db() as conn:
        where, params = _filters(tipo, status, source)
        rows = conn.execute(
            f"SELECT * FROM recipes{where} ORDER BY created_at DESC", params
        ).fetchall()
        return [_row_to_dict(r) for r in rows]


def get_recipe_by_slug(slug: str) -> Optional[dict]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM recipes WHERE slug = ?", (slug,)).fetchone()
        return _row_to_dict(row) if row else None


def search_recipes(query: str, tipo: str = "", status: str = "", source: str = "") -> list:
    with get_db() as conn:
        base_where, base_params = _filters(tipo, status, source)
        connector = " AND " if base_where else " WHERE "
        rows = conn.execute(
            f"""SELECT * FROM recipes{base_where}
                {connector}(title LIKE ? OR ingredients LIKE ? OR instructions LIKE ?)
                ORDER BY created_at DESC""",
            (*base_params, f"%{query}%", f"%{query}%", f"%{query}%"),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]


def _filters(tipo: str, status: str, source: str = ""):
    clauses, params = [], []
    if tipo in VALID_TIPO:
        clauses.append("tipo = ?")
        params.append(tipo)
    if status in VALID_STATUS:
        clauses.append("status = ?")
        params.append(status)
    if source:
        clauses.append("source_url LIKE ?")
        params.append(f"%{source}%")
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    return where, params


def _row_to_dict(row) -> dict:
    d = dict(row)
    d["ingredients"] = json.loads(d["ingredients"])
    d["instructions"] = json.loads(d["instructions"])
    return d
