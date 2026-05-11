#!/usr/bin/env python3
"""
Push local recipes to the deployed app.
Usage: python migrate_local.py https://your-app.up.railway.app
"""
import json
import sqlite3
import sys
from pathlib import Path

try:
    import httpx
except ImportError:
    print("Run: pip install httpx"); sys.exit(1)

def migrate(api_base: str, db_path: str = "recipes.db"):
    db_path = Path(db_path)
    if not db_path.exists():
        print(f"Database not found: {db_path}"); sys.exit(1)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM recipes ORDER BY created_at").fetchall()
    print(f"Found {len(rows)} recipes locally\n")

    recipes = []
    for row in rows:
        d = dict(row)
        d["ingredients"]  = json.loads(d["ingredients"])
        d["instructions"] = json.loads(d["instructions"])
        recipes.append(d)

    client = httpx.Client(timeout=60)
    try:
        r = client.post(f"{api_base}/api/recipes/import", json=recipes)
        r.raise_for_status()
        print(f"Done — {len(recipes)} recipes imported")
    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python migrate_local.py https://your-app.up.railway.app")
        sys.exit(1)
    migrate(sys.argv[1].rstrip("/"))
