from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import aiofiles
from endpoints import router
from services.openai import assistant, client, TOOLS
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
        # 1. ベクターストアの初期化
        if not assistant.vector_store_id:
            logger.debug("Checking existing vector stores...")
            vector_stores = await client.beta.vector_stores.list()
            if vector_stores.data:
                assistant.vector_store_id = vector_stores.data[0].id
                logger.info("Reusing existing vector store: %s", assistant.vector_store_id)
            else:
                vector_store = await client.beta.vector_stores.create()
                assistant.vector_store_id = vector_store.id
                logger.info("New vector store created with ID: %s", assistant.vector_store_id)

        # 2. 既存のアシスタントを削除
        if assistant.assistant_id:
            try:
                await client.beta.assistants.delete(assistant.assistant_id)
                logger.info("Deleted existing assistant: %s", assistant.assistant_id)
                assistant.assistant_id = None
            except Exception as e:
                logger.warning("Failed to delete assistant: %s", e)
                assistant.assistant_id = None

        # 3. 新しいアシスタントを作成
        logger.info("Creating new assistant...")
        new_assistant = await client.beta.assistants.create(
            name="Assistant",
            model="gpt-4o",
            instructions=assistant.instructions,
            tools=TOOLS,
            tool_resources={"file_search": {"vector_store_ids": [assistant.vector_store_id]}}
        )
        assistant.assistant_id = new_assistant.id
        logger.info("Created new assistant with ID: %s", assistant.assistant_id)

        # 4. 会話スレッドの作成
        thread = await client.beta.threads.create()
        assistant.conversation_thread = thread.id
        logger.info("Thread created with ID: %s", assistant.conversation_thread)

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
