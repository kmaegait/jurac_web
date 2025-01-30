import asyncio
import base64
from datetime import datetime
import json
import os
from typing import Optional, List
from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from services.openai import assistant, call_dxa_factory, client
from utils.log import logger

router = APIRouter()

class Message(BaseModel):
    text: str = ""
    content: Optional[List] = None


# ストリーミングイベントの種類を定義
class StreamingEvent:
    THINKING = "thinking"
    FUNCTION_CALL = "function_call"
    COMPLETE = "complete"


@router.post("/chat")
async def chat(message: Message):
    try:
        if not assistant.conversation_thread or not assistant.assistant_id:
            await assistant.initialize()

        content = []

        # テキストメッセージの処理
        if message.text:
            text_content = message.text.strip()
            command_lower = text_content.lower()

            # コマンド処理
            if command_lower == '/asst':
                try:
                    await assistant.initialize_for_asst()
                    assistant_info = await client.beta.assistants.retrieve(assistant.assistant_id)

                    info_text = (
                        f"Assistant Information:\n\n"
                        f"ID: {assistant_info.id}\n"
                        f"Name: {assistant_info.name}\n"
                        f"Model: {assistant_info.model}\n"
                        f"Created: {datetime.fromtimestamp(assistant_info.created_at).strftime('%Y-%m-%d %H:%M:%S')}\n"
                        f"Instructions: {assistant_info.instructions}\n\n"
                        f"Tools: {', '.join(tool.type for tool in assistant_info.tools)}\n"
                        f"Vector Store ID: {assistant.vector_store_id}"
                    )

                    return StreamingResponse(
                        stream_single_response(info_text),
                        media_type="text/event-stream"
                    )
                except Exception as e:
                    logger.error(f"Error retrieving assistant information: {str(e)}")
                    return StreamingResponse(
                        stream_single_response(f"Error: {str(e)}"),
                        media_type="text/event-stream"
                    )

            if command_lower.startswith('/inst '):
                try:
                    new_instructions = text_content[6:].strip()
                    if not new_instructions:
                        return StreamingResponse(
                            stream_single_response("Error: Instructions cannot be empty"),
                            media_type="text/event-stream"
                        )

                    if not assistant.assistant_id:
                        await assistant.initialize_for_asst()

                    updated_assistant = await client.beta.assistants.update(
                        assistant_id=assistant.assistant_id,
                        instructions=new_instructions
                    )

                    info_text = (
                        f"Instructions updated successfully!\n\n"
                        f"New Instructions: {updated_assistant.instructions}"
                    )

                    return StreamingResponse(
                        stream_single_response(info_text),
                        media_type="text/event-stream"
                    )
                except Exception as e:
                    logger.error(f"Error updating assistant instructions: {str(e)}")
                    return StreamingResponse(
                        stream_single_response(f"Error: {str(e)}"),
                        media_type="text/event-stream"
                    )

            content.append({"type": "text", "text": text_content})

        # 画像の処理
        if message.content:
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

        # メッセージを作成して送信
        return StreamingResponse(
            stream_chat_response(content, assistant.conversation_thread, assistant.assistant_id),
            media_type="text/event-stream"
        )
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "text": f"Error: {str(e)}",
                "token_usage": {
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0
                }
            }
        )


async def stream_chat_response(message_content: str | list, thread_id: str, assistant_id: str):
    try:
        # 初期のthinkingイベント
        yield json.dumps({
            "type": StreamingEvent.THINKING,
            "data": "Thinking..."
        }) + "\n"

        # メッセージを作成
        await client.beta.threads.messages.create(
            thread_id=thread_id,
            role="user",
            content=message_content
        )

        # 実行を開始
        run = await client.beta.threads.runs.create(
            thread_id=thread_id,
            assistant_id=assistant_id,
            model="gpt-4o",
            tool_choice="auto"
        )

        while True:
            run_status = await client.beta.threads.runs.retrieve(
                thread_id=thread_id,
                run_id=run.id
            )

            if run_status.status == "requires_action":
                tool_calls = run_status.required_action.submit_tool_outputs.tool_calls
                for tool_call in tool_calls:
                    if tool_call.type == "function":
                        # Function呼び出し時のイベント
                        yield json.dumps({
                            "type": StreamingEvent.FUNCTION_CALL,
                            "data": tool_call.function.name
                        }) + "\n"

                        # Function実行結果を処理
                        tool_outputs = []
                        if tool_call.function.name == "call_dxa_factory":
                            try:
                                arg = json.loads(tool_call.function.arguments)
                                answer = call_dxa_factory(arg['question'])
                                tool_outputs.append({
                                    "tool_call_id": tool_call.id,
                                    "output": answer if answer else "該当する決算情報が見つかりませんでした。"
                                })
                            except Exception as e:
                                logger.error(f"Error in call_dxa_factory: {str(e)}")
                                tool_outputs.append({
                                    "tool_call_id": tool_call.id,
                                    "output": "決算情報の処理中にエラーが発生しました。"
                                })

                # ツール実行結果を送信
                if tool_outputs:
                    await client.beta.threads.runs.submit_tool_outputs(
                        thread_id=thread_id,
                        run_id=run.id,
                        tool_outputs=tool_outputs
                    )

            elif run_status.status == "completed":
                # 完了時の処理
                messages = await client.beta.threads.messages.list(
                    thread_id=thread_id
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

                    response = {
                        "type": StreamingEvent.COMPLETE,
                        "data": {
                            "text": full_response,
                            "token_usage": {
                                "prompt_tokens": run_status.usage.prompt_tokens,
                                "completion_tokens": run_status.usage.completion_tokens,
                                "total_tokens": run_status.usage.total_tokens
                            },
                            "files": downloaded_files
                        }
                    }
                    yield json.dumps(response) + "\n"
                break

            elif run_status.status in ["failed", "cancelled", "expired"]:
                yield json.dumps({
                    "type": StreamingEvent.COMPLETE,
                    "data": {
                        "text": f"Error: Run failed with status {run_status.status}",
                        "token_usage": {
                            "prompt_tokens": 0,
                            "completion_tokens": 0,
                            "total_tokens": 0
                        }
                    }
                }) + "\n"
                break

            await asyncio.sleep(0.5)

    except Exception as e:
        logger.error(f"Error in stream_chat_response: {str(e)}")
        yield json.dumps({
            "type": StreamingEvent.COMPLETE,
            "data": {
                "text": f"Error: {str(e)}",
                "token_usage": {
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0
                }
            }
        }) + "\n"


async def stream_single_response(text: str):
    """
    単一のレスポンスをストリーミング形式で返す補助関数
    """
    yield json.dumps({
        "type": StreamingEvent.THINKING,
        "data": "Processing command..."
    }) + "\n"

    yield json.dumps({
        "type": StreamingEvent.COMPLETE,
        "data": {
            "text": text,
            "token_usage": {
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0
            }
        }
    }) + "\n"
