from fastapi import APIRouter, HTTPException
from services.openai import assistant, client, TOOLS
from utils.log import logger

router = APIRouter()

@router.post("/initialize-assistant")
async def initialize_assistant(request: dict):
    try:
        vector_store_id = request.get("vector_store_id")
        model = "gpt-4o"

        if not vector_store_id:
            raise HTTPException(status_code=400, detail="Missing vector_store_id")

        # 既存のアシスタントをチック
        if assistant.assistant_id:
            try:
                # 既存のアシスタントが有効か確認
                existing_assistant = await client.beta.assistants.retrieve(assistant.assistant_id)
                logger.info(f"Reusing existing assistant: {existing_assistant.id}")

                # 新しいスレッドを作成
                thread = await client.beta.threads.create()

                return {
                    "assistant_id": existing_assistant.id,
                    "thread_id": thread.id,
                    "vector_store_id": vector_store_id,
                    "reused": True
                }
            except Exception as e:
                logger.warning(f"Failed to retrieve existing assistant: {str(e)}")
                assistant.assistant_id = None  # リット

        # 新しいアシスタントを作成
        logger.info("Creating new assistant...")
        new_assistant = await client.beta.assistants.create(
            name="Web Assistant",
            model=model,
            instructions=assistant.instructions,
            tools=TOOLS,
            tool_resources={"file_search": {"vector_store_ids": [vector_store_id]}}
        )

        # スレッドを作成
        thread = await client.beta.threads.create()

        # グローバのassistantインスタンスを更新
        assistant.assistant_id = new_assistant.id
        assistant.vector_store_id = vector_store_id

        return {
            "assistant_id": new_assistant.id,
            "thread_id": thread.id,
            "vector_store_id": vector_store_id,
            "reused": False
        }
    except Exception as e:
        logger.error(f"Error initializing assistant: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/check-assistant")
async def check_assistant():
    try:
        if assistant.assistant_id:
            # 既存のアシスタントが有効かどうかを確認
            try:
                await client.beta.assistants.retrieve(assistant.assistant_id)
                return {"assistant_id": assistant.assistant_id}
            except Exception as e:
                logger.warning(f"Failed to retrieve assistant: {str(e)}")
                assistant.assistant_id = None  # 無効なアシスタントIDをリセット

        return {"assistant_id": None}

    except Exception as e:
        logger.error(f"Error checking assistant: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
