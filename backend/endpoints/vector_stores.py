from fastapi import APIRouter, HTTPException
from services.openai import client
from utils.log import logger

router = APIRouter()

@router.get("/vector-stores")
async def list_vector_stores():
    try:
        vector_stores = await client.beta.vector_stores.list()
        return {
            "vector_stores": [
                {
                    "id": store.id,
                    "name": store.name,
                    "created_at": store.created_at
                }
                for store in vector_stores.data
            ]
        }
    except Exception as e:
        logger.error(f"Error listing vector stores: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
