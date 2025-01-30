import base64
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from services.openai import assistant, client
from utils.log import logger

router = APIRouter()

@router.get("/files")
async def list_files():
    try:
        # vector_store_idが設定されているか確認
        if not assistant.vector_store_id:
            await assistant.initialize()

        # ベクターストア内のファイル一覧を取得
        vector_store_files = await client.beta.vector_stores.files.list(
            vector_store_id=assistant.vector_store_id
        )

        # ファイルメタデータを取得してファイル名を取得
        file_list = []
        for file in vector_store_files.data:
            try:
                file_metadata = await client.files.retrieve(file.id)
                file_list.append({
                    "file_id": file.id,
                    "filename": file_metadata.filename  # メタデータからファイル名を取得
                })
            except Exception as e:
                logger.warning(f"File with ID {file.id} could not be retrieved: {str(e)}")

        return {"files": file_list}
    except Exception as e:
        logger.error(f"Error listing files: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/files/{file_id}")
async def delete_file(file_id: str):
    try:
        # Vector Storeからファイルを削除
        deleted_vector_store_file = await client.beta.vector_stores.files.delete(
            vector_store_id=assistant.vector_store_id,
            file_id=file_id
        )

        # OpenAI Files APIからファイルを削除
        deleted_openai_file = await client.files.delete(file_id)

        if deleted_vector_store_file.deleted and deleted_openai_file.deleted:
            return {"message": "File deleted successfully"}
        raise HTTPException(status_code=400, detail="Failed to delete file")
    except Exception as e:
        logger.error(f"Error deleting file: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# 一括削除機能を追加
@router.delete("/files")
async def delete_all_files():
    try:
        # Vector Store内のすべてのファイルを削除
        vector_store_files = await client.beta.vector_stores.files.list(vector_store_id=assistant.vector_store_id)
        for file in vector_store_files.data:
            await client.beta.vector_stores.files.delete(
                vector_store_id=assistant.vector_store_id,
                file_id=file.id
            )

        # OpenAI Files APIからすべてのファイルを削除
        files = await client.files.list()
        for file in files.data:
            await client.files.delete(file.id)

        return {"message": "All files deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting all files: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ファイルダウンロード用のエンドポイントを追加
@router.get("/files/{file_id}/download")
async def download_file(file_id: str):
    try:
        file_metadata = await client.files.retrieve(file_id)
        file_content = await client.files.content(file_id)

        return Response(
            content=file_content.content,
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="{file_metadata.filename}"'
            }
        )
    except Exception as e:
        logger.error(f"Error downloading file: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        # vector_store_idが設定されているか確認し、必要に応じて初期化
        if not assistant.vector_store_id:
            await assistant.initialize()

        # ファイルの内容を直接読み込む
        content = await file.read()

        # Vector Storeにアップロード
        await assistant.upload_file_to_vector_store(content, file.filename)

        return JSONResponse(content={"message": "File uploaded successfully"})
    except Exception as e:
        logger.error(f"Error uploading file: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload-image")
async def upload_image(file: UploadFile = File(...)):
    try:
        # ファイルの内容を読み込む
        contents = await file.read()

        # Base64エンコード
        base64_image = base64.b64encode(contents).decode('utf-8')

        # 画像の種類を判断
        image_type = "jpeg"  # デフォルト
        if file.filename.lower().endswith('.png'):
            image_type = "png"
        elif file.filename.lower().endswith('.gif'):
            image_type = "gif"
        elif file.filename.lower().endswith('.webp'):
            image_type = "webp"

        # データURLを作成（OpenAIのAPIが期待する形式）
        data_url = f"data:image/{image_type};base64,{base64_image}"

        return {
            "url": data_url
        }
    except Exception as e:
        logger.error(f"Error uploading image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
