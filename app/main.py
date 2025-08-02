from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import json
import httpx

app = FastAPI()

# Configuration
SPOONACULAR_API_KEY = "###############"
STATIC_DIR = Path("C:/HTML/chefgenie/static")
RECIPES_FILE = STATIC_DIR / "recipes.json"

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static file routes
app.mount("/static", StaticFiles(directory=STATIC_DIR, html=True), name="static")

@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")

@app.get("/manifest.json")
async def manifest():
    return FileResponse(STATIC_DIR / "manifest.json", media_type='application/json')

@app.get("/style.css")
async def style():
    return FileResponse(STATIC_DIR / "style.css", media_type='text/css')

@app.get("/script.js")
async def script():
    return FileResponse(STATIC_DIR / "script.js", media_type='application/javascript')


# Load local recipes (flat dictionary)
with open(RECIPES_FILE, encoding="utf-8") as f:
    recipes_data = json.load(f)

print("📖 Local recipes loaded:", list(recipes_data.keys()))


@app.post("/process")
async def process_command(request: Request):
    try:
        data = await request.json()
        command = data.get("text", "").lower()

        if command in ["stop", "cancel", "exit", "quit"]:
            return {"stopped": True, "message": "ChefGenie conversation stopped."}

        # Clean and normalize the user command
        for phrase in ["how to make", "recipe for", "hey chefgenie"]:
            command = command.replace(phrase, "")
        dish = command.strip()

        print(f"Requested dish: {dish}")

        # Try Spoonacular API first
        try:
            async with httpx.AsyncClient() as client:
                search_res = await client.get(
                    "https://api.spoonacular.com/recipes/complexSearch",
                    params={"query": dish, "number": 1, "apiKey": SPOONACULAR_API_KEY},
                    timeout=5
                )

            results = search_res.json().get("results", [])
            if search_res.status_code == 200 and results:
                recipe_id = results[0]["id"]
                async with httpx.AsyncClient() as client:
                    info_res = await client.get(
                        f"https://api.spoonacular.com/recipes/{recipe_id}/information",
                        params={"includeNutrition": True, "apiKey": SPOONACULAR_API_KEY},
                        timeout=5
                    )

                if info_res.status_code == 200:
                    info = info_res.json()
                    return {
                        "recipe": {
                            "title": info.get("title", dish.title()),
                            "ingredients": [i["original"] for i in info.get("extendedIngredients", [])],
                            "steps": [s["step"] for s in info.get("analyzedInstructions", [{}])[0].get("steps", [])],
                            "nutrition": {
                                n["name"]: f"{n['amount']} {n['unit']}"
                                for n in info.get("nutrition", {}).get("nutrients", [])[:3]
                            }
                        }
                    }
        except Exception as api_error:
            print("⚠️ Spoonacular API failed:", api_error)

        # Fallback to local JSON
        for key, recipe in recipes_data.items():
            if dish in key or key in dish:
                print("✅ Matched local recipe:", recipe["name"])
                return {"recipe": {
                    "title": recipe["name"],
                    "ingredients": recipe["ingredients"],
                    "steps": recipe["steps"],
                    "nutrition": recipe["nutrition"]
                }}

        print("❌ No recipe found for:", dish)
        return {"error": f"No recipe found for '{dish}'"}

    except Exception as e:
        print("🚨 Internal error:", e)
        return JSONResponse(status_code=500, content={"error": str(e)})

