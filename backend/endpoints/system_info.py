from fastapi import APIRouter, HTTPException
from services.openai import get_assistant
from utils.log import logger

router = APIRouter()

@router.get("/system-info")
async def get_system_info():
    try:
        assistant = await get_assistant()
        return {
            "assistant_id": assistant.assistant_id,
            "vector_store_id": assistant.vector_store_id
        }
    except Exception as e:
        logger.error(f"Error getting system info: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
