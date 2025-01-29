from fastapi import APIRouter
from endpoints import (
    assistants,
    chat,
    files,
    system_info,
    vector_stores,
)

router = APIRouter(prefix="/api")
router.include_router(assistants.router, tags=["assistants"])
router.include_router(chat.router, tags=["chat"])
router.include_router(files.router, tags=["files"])
router.include_router(system_info.router, tags=["system_info"])
router.include_router(vector_stores.router, tags=["vector_stores"])
