from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from pydantic import BaseModel
from typing import Optional
import os
import database
import extractor

_data = os.getenv("DATA_DIR")
IMAGES_DIR = Path(_data) / "images" if _data else Path(__file__).parent / "static" / "images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="EAT")
database.init_db()


class AddRecipeRequest(BaseModel):
    url: str


class AddTextRequest(BaseModel):
    text: str
    source_url: str = ""


class UpdateRecipeRequest(BaseModel):
    status: Optional[str] = None
    tipo: Optional[str] = None
    image_url: Optional[str] = None
    title: Optional[str] = None
    servings: Optional[str] = None
    ingredients: Optional[list] = None
    instructions: Optional[list] = None


@app.post("/api/recipes")
def add_recipe(req: AddRecipeRequest):
    try:
        data = extractor.extract_recipe(req.url)
        return database.save_recipe(data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/recipes/from-text")
def add_recipe_from_text(req: AddTextRequest):
    try:
        data = extractor.extract_from_text(req.text, req.source_url)
        return database.save_recipe(data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/sources")
def list_sources():
    return database.get_sources()


@app.post("/api/recipes/from-image")
async def add_recipe_from_image(file: UploadFile = File(...)):
    allowed = {"image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"}
    media_type = (file.content_type or "image/jpeg").lower()
    if media_type not in allowed:
        raise HTTPException(status_code=400, detail="Formato não suportado.")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Imagem muito grande (máx. 10 MB).")
    try:
        recipe_data = extractor.extract_from_image(data, media_type)
        return database.save_recipe(recipe_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/recipes")
def list_recipes(q: str = "", tipo: str = "", status: str = "", source: str = ""):
    if q:
        return database.search_recipes(q, tipo=tipo, status=status, source=source)
    return database.get_all_recipes(tipo=tipo, status=status, source=source)


@app.get("/api/recipes/{slug}")
def get_recipe(slug: str):
    recipe = database.get_recipe_by_slug(slug)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe


@app.patch("/api/recipes/{slug}")
def update_recipe(slug: str, req: UpdateRecipeRequest):
    recipe = database.update_recipe(slug, req.dict(exclude_none=True))
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe


@app.post("/api/recipes/{slug}/image")
async def upload_image(slug: str, file: UploadFile = File(...)):
    if not database.get_recipe_by_slug(slug):
        raise HTTPException(status_code=404, detail="Recipe not found")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Imagem muito grande (máx. 10 MB).")
    ext = (file.filename or "jpg").rsplit(".", 1)[-1].lower()
    if ext not in {"jpg", "jpeg", "png", "webp", "gif"}:
        ext = "jpg"
    dest = IMAGES_DIR / f"{slug}.{ext}"
    dest.write_bytes(data)
    image_url = f"/images/{slug}.{ext}"
    return database.update_recipe(slug, {"image_url": image_url})


app.mount("/images", StaticFiles(directory=str(IMAGES_DIR)), name="recipe-images")
app.mount("/", StaticFiles(directory="static", html=True), name="static")
