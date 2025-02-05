from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import aiofiles
from endpoints import router
from services.openai import get_assistant, client, TOOLS
from settings import const
from utils.log import logger

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

# サーバー起動時の初期化関数
async def initialize_on_startup():
    try:
        assistant = await get_assistant()
        logger.info("Assistant initialization completed successfully")
    except Exception as e:
        logger.error("Error initializing assistant on startup: %s", e)
        raise


@app.on_event("startup")
async def startup_event():
    await initialize_on_startup()


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="debug"
    )
