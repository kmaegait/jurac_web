import json
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import AsyncOpenAI
import os
from dotenv import load_dotenv
import asyncio
import logging
import uvicorn
import aiofiles
import base64
from datetime import datetime
from typing import Optional, List
import requests

load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise ValueError("OPENAI_API_KEY is not set in environment variables")

app = FastAPI()
client = AsyncOpenAI(api_key=api_key)

# ロギングの設定を強化
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


AIKO_API_DOMAIN = os.getenv("AIKO_API_DOMAIN")
AIKO_API_KEY = os.getenv("AIKO_API_KEY")
AIKO_CONVERSATION_ID = os.getenv("AIKO_CONVERSATION_ID")

def generate_aiko_message(query):
    # TODO 一旦固定で作成済みのconversation_idを使用
    # conversation_id毎に会話履歴を保持しているのでチャンネル毎に作成した方が良い
    conversation_id = AIKO_CONVERSATION_ID
    url = f'{AIKO_API_DOMAIN}/conversations/{conversation_id}/messages/sync'
    body = json.dumps({ "message": query, "language_code": "ja" })

    response = requests.post(
        url,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {AIKO_API_KEY}"
        },
        data=body
    )
    try:
        response.raise_for_status()
    except RequestException as e:
        logger.error(f"request failed. error=({e.response.text})")
        return f"request failed. status: {response.status_code}"
    data = response.json()
    logger.info(data)
    return data['answer']['response']['task_result']['content']


def answer_using_securities_report(question: str) -> str:
    return generate_aiko_message(question)


def answer_management_strategy(question: str) -> str:
    return generate_aiko_message(question)


class Message(BaseModel):
    text: str = ""
    content: Optional[List] = None  # 型ヒントを修正

class Assistant:
    def __init__(self):
        self.conversation_thread = None
        self.assistant_id = self.load_assistant_id()
        self.model = "gpt-4o"
        self.instructions = self.read_instructions()
        self.vector_store_id = None

    @staticmethod
    def load_assistant_id():
        return os.getenv("ASSISTANT_ID")

    @staticmethod
    def read_instructions():
        try:
            with open('instructions.yaml', 'r', encoding='utf-8') as file:
                return file.read()
        except FileNotFoundError:
            return "あなたは親切なアシスタントです。"

    async def initialize(self):
        try:
            # 1. まず最初にベクターストアの確認と設定
            if not self.vector_store_id:
                logger.debug("Checking existing vector stores...")
                vector_stores = await client.beta.vector_stores.list()
                if vector_stores.data:
                    # 既存のベクターストアを使用
                    self.vector_store_id = vector_stores.data[0].id
                    logger.info(f"Reusing existing vector store: {self.vector_store_id}")
                else:
                    # ベクターストアが存在しない場合のみ新規作成
                    logger.debug("No existing vector store found. Creating new vector store...")
                    vector_store = await client.beta.vector_stores.create()
                    self.vector_store_id = vector_store.id
                    logger.info(f"New vector store created with ID: {self.vector_store_id}")

            # 2. 既存のアシスタントを確認
            if not self.assistant_id:
                logger.debug("Checking existing assistants...")
                assistants = await client.beta.assistants.list(limit=1)  # 最初の1件だけ取得
                
                if assistants.data:
                    self.assistant_id = assistants.data[0].id
                    logger.info(f"Using existing assistant: {self.assistant_id}")
                else:
                    # アシスタントが存在しない場合のみ新規作成
                    logger.debug("No existing assistant found. Creating new assistant...")
                    new_assistant = await client.beta.assistants.create(
                        name="Assistant",
                        model=self.model,
                        instructions=self.instructions,
                        tools=[
                            {"type": "code_interpreter"},
                            {"type": "file_search"},
                            {
                                "type": "function",
                                "function": {
                                    "name": "answer_using_securities_report",
                                    "description": "有価証券報告書についての回答を返す",
                                    "parameters": {
                                        "type": "object",
                                        "properties": {
                                            "question": {
                                                "type": "string",
                                                "description": "ユーザからの質問内容",
                                            },
                                        },
                                        "required": ["question"],
                                    },
                                },
                            },
                            {
                                "type": "function",
                                "function": {
                                    "name": "answer_management_strategy",
                                    "description": "経営戦略についての回答を返す",
                                    "parameters": {
                                        "type": "object",
                                        "properties": {
                                            "question": {
                                                "type": "string",
                                                "description": "ユーザからの質問内容",
                                            },
                                        },
                                        "required": ["question"],
                                    },
                                },
                            },
                        ],
                        tool_resources={"file_search": {"vector_store_ids": [self.vector_store_id]}}
                    )
                    self.assistant_id = new_assistant.id
                    logger.info(f"Created new assistant with ID: {self.assistant_id}")

            # 3. 会話スレッドの作成
            if not self.conversation_thread:
                logger.debug("Creating thread...")
                thread = await client.beta.threads.create()
                self.conversation_thread = thread.id
                logger.info(f"Thread created with ID: {self.conversation_thread}")

        except Exception as e:
            logger.error(f"Error during initialization: {str(e)}", exc_info=True)
            raise

    async def get_response(self, message: str):
        try:
            logger.debug("Starting get_response...")
            await self.initialize()
            
            logger.debug(f"Creating message in thread {self.conversation_thread}")
            await client.beta.threads.messages.create(
                thread_id=self.conversation_thread,
                role="user",
                content=message
            )

            # アシスタントの設定を確認し、必要に応じて更新
            try:
                assistant_info = await client.beta.assistants.retrieve(self.assistant_id)
                current_vector_store_ids = assistant_info.tool_resources.get('file_search', {}).get('vector_store_ids', [])
                
                if self.vector_store_id not in current_vector_store_ids:
                    logger.info(f"Updating assistant with vector store ID: {self.vector_store_id}")
                    await client.beta.assistants.update(
                        assistant_id=self.assistant_id,
                        tools=[{"type": "code_interpreter"}, {"type": "file_search"}],
                        tool_resources={"file_search": {"vector_store_ids": [self.vector_store_id]}}
                    )
            except Exception as e:
                logger.error(f"Error checking/updating assistant configuration: {str(e)}")

            logger.debug(f"Starting run with assistant {self.assistant_id}")
            run = await client.beta.threads.runs.create(
                thread_id=self.conversation_thread,
                assistant_id=self.assistant_id
            )

            # 実行完了を待ち、usage情報を取得
            completed_run = await self.poll_run(run.id, self.conversation_thread)
            
            messages = await client.beta.threads.messages.list(
                thread_id=self.conversation_thread
            )
            assistant_message = next((msg for msg in messages.data if msg.role == "assistant"), None)

            # usageが辞書型であることを考慮した修正
            usage = completed_run.usage
            return {
                "text": assistant_message.content[0].text.value,
                "assistant_id": self.assistant_id,
                "vector_store_id": self.vector_store_id,
                "token_usage": {
                    "prompt_tokens": usage.prompt_tokens,
                    "completion_tokens": usage.completion_tokens,
                    "total_tokens": usage.total_tokens
                }
            }

        except Exception as e:
            logger.error(f"Error in get_response: {str(e)}", exc_info=True)
            raise

    async def poll_run(self, run_id, thread_id):
        while True:
            run = await client.beta.threads.runs.retrieve(
                thread_id=thread_id,
                run_id=run_id
            )
            logger.info("run status: %s", run.status)
            if run.status in ['completed', 'requires_action']:
                return run
            elif run.status in ['failed', 'cancelled', 'expired']:
                raise Exception(f"Run failed with status: {run.status}")
            await asyncio.sleep(0.5)

    async def generate_message(self, run_id, thread_id):
        while True:
            run = await self.poll_run(run_id, thread_id)
            if run.status == 'completed':
                return run

            # Loop through each tool in the required action section
            if run.status == 'requires_action' and run.required_action:
                # Define the list to store tool outputs
                tool_outputs = []

                for tool in run.required_action.submit_tool_outputs.tool_calls:
                    if tool.type != "function":
                        logger.info("no function tool: %s", tool)
                        continue

                    if tool.function.name == "answer_using_securities_report":
                        arg = json.loads(tool.function.arguments)
                        logger.info("answer_using_securities_report. arg: %s", arg)
                        answer = answer_using_securities_report(arg['question'])
                        tool_outputs.append({
                            "tool_call_id": tool.id,
                            "output": answer,
                        })
                    elif tool.function.name == "answer_management_strategy":
                        arg = json.loads(tool.function.arguments)
                        logger.info("answer_management_strategy. arg: %s", arg)
                        answer = answer_management_strategy(arg['question'])
                        tool_outputs.append({
                            "tool_call_id": tool.id,
                            "output": answer,
                        })

                # Submit all tool outputs at once after collecting them in a list
                if tool_outputs:
                    try:
                        _ = await client.beta.threads.runs.submit_tool_outputs_and_poll(
                            thread_id=thread_id,
                            run_id=run_id,
                            tool_outputs=tool_outputs
                        )
                        logger.info("Tool outputs submitted successfully.")
                    except Exception as e:
                        logger.error("Failed to submit tool outputs: %s", e)
                        raise
                else:
                    raise Exception("No tool outputs to submit.")

    async def upload_file_to_vector_store(self, content, filename):
        try:
            # ファイルをVector Storeにアップロード
            await client.beta.vector_stores.file_batches.upload_and_poll(
                vector_store_id=self.vector_store_id,
                files=[(filename, content)]
            )
            logger.info(f"File uploaded to vector store: {filename}")
        except Exception as e:
            logger.error(f"Error uploading file to vector store: {str(e)}")
            raise

class FileInfo(BaseModel):
    filename: str
    file_id: str

@app.get("/api/files")
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

@app.post("/api/upload")
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

@app.delete("/api/files/{file_id}")
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
@app.delete("/api/files")
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

assistant = Assistant()

@app.post("/api/chat")
async def chat(message: Message):
    try:
        logger.info(f"Received message: {message.text}")

        # /asst コマンドの処理を追加
        if message.text and message.text.strip() == '/asst':
            try:
                # アシスタントIDが設定されていない場合は初期化
                if not assistant.assistant_id:
                    await assistant.initialize()

                logger.info(f"Retrieving assistant info for ID: {assistant.assistant_id}")
                assistant_info = await client.beta.assistants.retrieve(assistant.assistant_id)
                info_text = (
                    f"Assistant Information:\n\n"
                    f"ID: {assistant_info.id}\n"
                    f"Name: {assistant_info.name}\n"
                    f"Model: {assistant_info.model}\n"
                    f"Created: {datetime.fromtimestamp(assistant_info.created_at).strftime('%Y-%m-%d %H:%M:%S')}\n"
                    f"Instructions: {assistant_info.instructions}\n\n"
                    f"Tools: {', '.join(tool.type for tool in assistant_info.tools)}"
                )
                return {
                    "text": info_text,
                    "token_usage": {
                        "prompt_tokens": 0,
                        "completion_tokens": 0,
                        "total_tokens": 0
                    }
                }
            except Exception as e:
                logger.error(f"Error retrieving assistant info: {str(e)}")
                return {
                    "text": f"Error retrieving assistant information: {str(e)}",
                    "token_usage": {
                        "prompt_tokens": 0,
                        "completion_tokens": 0,
                        "total_tokens": 0
                    }
                }

        # message.content 内の /asst コマンドの処理を追加
        if message.content:
            for item in message.content:
                if item.get("type") == "text" and item.get("text").strip() == '/asst':
                    try:
                        # アシスタントIDが設定されていない場合は初期化
                        if not assistant.assistant_id:
                            await assistant.initialize()

                        logger.info(f"Retrieving assistant info for ID: {assistant.assistant_id}")
                        assistant_info = await client.beta.assistants.retrieve(assistant.assistant_id)
                        info_text = (
                            f"Assistant Information:\n\n"
                            f"ID: {assistant_info.id}\n"
                            f"Name: {assistant_info.name}\n"
                            f"Model: {assistant_info.model}\n"
                            f"Created: {datetime.fromtimestamp(assistant_info.created_at).strftime('%Y-%m-%d %H:%M:%S')}\n"
                            f"Instructions: {assistant_info.instructions}\n\n"
                            f"Tools: {', '.join(tool.type for tool in assistant_info.tools)}"
                        )
                        return {
                            "text": info_text,
                            "token_usage": {
                                "prompt_tokens": 0,
                                "completion_tokens": 0,
                                "total_tokens": 0
                            }
                        }
                    except Exception as e:
                        logger.error(f"Error retrieving assistant info: {str(e)}")
                        return {
                            "text": f"Error retrieving assistant information: {str(e)}",
                            "token_usage": {
                                "prompt_tokens": 0,
                                "completion_tokens": 0,
                                "total_tokens": 0
                            }
                        }

        # 既存のチャット処理を続行
        if not assistant.conversation_thread:
            await assistant.initialize()

        # 画像URLを含むメッセージを作成
        if message.content:
            # 画像URLを公開アクセス可能なURLに変換
            content = []
            for item in message.content:
                if item.get("type") == "image_url":
                    # Base64データをOpenAIのファイルとしてアップロード
                    base64_url = item["image_url"]["url"]
                    # Base64のヘッダー部分を削除
                    base64_data = base64_url.split(",")[1]
                    # バイナリデータに変換
                    image_data = base64.b64decode(base64_data)

                    # 一時ファイルとして保存
                    temp_file_path = f"temp_image_{len(content)}.png"
                    with open(temp_file_path, "wb") as f:
                        f.write(image_data)

                    # OpenAIにファイルをアップロード
                    with open(temp_file_path, "rb") as f:
                        file_response = await client.files.create(
                            file=f,
                            purpose="assistants"
                        )

                    # 一時ファイルを削除
                    os.remove(temp_file_path)

                    # ファイルURLを使用
                    content.append({
                        "type": "image_file",
                        "image_file": {
                            "file_id": file_response.id
                        }
                    })
                else:
                    content.append(item)
        else:
            content = [{"type": "text", "text": message.text}]

        # メッセージを作成
        await client.beta.threads.messages.create(
            thread_id=assistant.conversation_thread,
            role="user",
            content=content
        )

        logger.debug(f"Starting run with assistant {assistant.assistant_id}")
        run = await client.beta.threads.runs.create(
            thread_id=assistant.conversation_thread,
            assistant_id=assistant.assistant_id,
            model="gpt-4o"  # Vision対応モデルからgpt-4oに変更
        )

        completed_run = await assistant.generate_message(run.id, assistant.conversation_thread)

        messages = await client.beta.threads.messages.list(
            thread_id=assistant.conversation_thread
        )
        assistant_message = next((msg for msg in messages.data if msg.role == "assistant"), None)

        if assistant_message:
            full_response = ""
            file_ids_to_download = []

            for content_item in assistant_message.content:
                if content_item.type == 'text':
                    full_response += content_item.text.value
                    # アノテーションからファイルIDを抽出
                    for annotation in content_item.text.annotations:
                        if hasattr(annotation, 'file_path') and hasattr(annotation.file_path, 'file_id'):
                            file_ids_to_download.append(annotation.file_path.file_id)
                elif content_item.type == 'image_file':
                    file_ids_to_download.append(content_item.image_file.file_id)

            # 実行ステップを取得
            run_steps = await client.beta.threads.runs.steps.list(
                thread_id=assistant.conversation_thread,
                run_id=run.id
            )

            # ダウンロードされたファイル情報を処理
            downloaded_files = []
            for file_id in file_ids_to_download:
                try:
                    file_metadata = await client.files.retrieve(file_id)
                    file_content = await client.files.content(file_id)

                    # ダウンロードディレクトリを作成
                    download_dir = "./downloaded_files"
                    os.makedirs(download_dir, exist_ok=True)

                    # ファイルを保存
                    file_path = os.path.join(download_dir, file_metadata.filename)
                    with open(file_path, "wb") as f:
                        f.write(file_content.content)

                    downloaded_files.append({
                        "file_id": file_id,
                        "filename": file_metadata.filename,
                        "path": file_path
                    })
                except Exception as e:
                    logger.error(f"Error downloading file {file_id}: {str(e)}")

            return {
                "text": full_response,
                "token_usage": completed_run.usage,
                "files": downloaded_files,
                "run_steps": run_steps.data  # 実行ステップを追加
            }

    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/system-info")
async def get_system_info():
    try:
        # 初期化されていない場合は初期化を実行
        if not assistant.vector_store_id or not assistant.assistant_id:
            await assistant.initialize()
            
        return {
            "assistant_id": assistant.assistant_id,
            "vector_store_id": assistant.vector_store_id
        }
    except Exception as e:
        logger.error(f"Error getting system info: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/vector-stores")
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

@app.post("/api/initialize-assistant")
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
            tools=[{"type": "code_interpreter"}, {"type": "file_search"}],
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

@app.get("/api/check-assistant")
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

@app.post("/api/upload-image")
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

# ファイルダウンロード用のエンドポイントを追加
@app.get("/api/files/{file_id}/download")
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

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="debug"
    )
