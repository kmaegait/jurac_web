import asyncio
import json
import requests
from requests.exceptions import RequestException
from openai import AsyncOpenAI
from settings import env
from utils.log import logger

# グローバル定数の定義
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "call_dxa_factory",
            "description": """
決算短信や財務情報に関する質問に回答します。
以下のような質問に対して使用します：
- 決算短信の内容に関する質問
- 財務情報（売上、利益、業績など）についての質問
- 最新のデータが必要な場合の質問

使用例：
- 「今期の営業利益はいくらですか？」
- 「純利益の前年比はどうですか？」
- 「決算における業績の特徴は？」
""",
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "決算短信に関する具体的な質問内容",
                    },
                },
                "required": ["question"],
            },
        },
    },
    {"type": "code_interpreter"},
    {"type": "file_search"}
]

client = AsyncOpenAI(api_key=env.API_KEY)

def _generate_aiko_message(query):
    # TODO 一旦固定で作成済みのconversation_idを使用
    # conversation_id毎に会話履歴を保持しているのでチャンネル毎に作成した方が良い
    conversation_id = env.AIKO_CONVERSATION_ID
    url = f'{env.AIKO_API_DOMAIN}/conversations/{conversation_id}/messages/sync'
    body = json.dumps({ "message": query, "language_code": "ja" })

    response = requests.post(
        url,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {env.AIKO_API_KEY}"
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


def call_dxa_factory(question: str) -> str:
    return _generate_aiko_message(question)


class Assistant:
    def __init__(self):
        self.conversation_thread = None
        self.assistant_id = None
        self.model = "gpt-4o"
        self.instructions = self.read_instructions()
        self.vector_store_id = None

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

            # 2. アシスタントの設定
            if not self.assistant_id:
                # 環境変数からアシスタントIDを取得
                env_assistant_id = env.ASSISTANT_ID
                if env_assistant_id:
                    try:
                        # 環境変数のアシスタントIDが有効か確認
                        existing_assistant = await client.beta.assistants.retrieve(env_assistant_id)
                        self.assistant_id = existing_assistant.id
                        logger.info(f"Using assistant from environment variable: {self.assistant_id}")
                    except Exception as e:
                        logger.warning(f"Failed to retrieve assistant from environment variable: {str(e)}")
                        self.assistant_id = None

            # アシスタントIDがない場合は新規作成
            if not self.assistant_id:
                logger.info("Creating new assistant...")
                new_assistant = await client.beta.assistants.create(
                    name="Assistant",
                    model=self.model,
                    instructions=self.instructions,
                    tools=TOOLS,
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

            logger.debug("Creating message in thread %s", self.conversation_thread)
            await client.beta.threads.messages.create(
                thread_id=self.conversation_thread,
                role="user",
                content=message
            )

            logger.debug("Starting run with assistant %s", self.assistant_id)
            run = await client.beta.threads.runs.create(
                thread_id=self.conversation_thread,
                assistant_id=self.assistant_id,
                model="gpt-4o",
                tool_choice="auto"
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
            if run.status in ['failed', 'cancelled', 'expired']:
                raise Exception(f"Run failed with status: {run.status}")
            await asyncio.sleep(0.5)

    async def generate_message(self, run_id, thread_id):
        while True:
            try:
                run = await self.poll_run(run_id, thread_id)
                logger.debug("Run status: %s", run.status)

                if run.status == 'completed':
                    return run
                if run.status in ['failed', 'cancelled', 'expired']:
                    # 失敗した場合は実行をキャンセル
                    await client.beta.threads.runs.cancel(
                        thread_id=thread_id,
                        run_id=run_id
                    )
                    raise Exception(f"Run failed with status: {run.status}")

                # Loop through each tool in the required action section
                if run.status == 'requires_action' and run.required_action:
                    logger.info(f"Required action details: {json.dumps(run.required_action.model_dump(), indent=2)}")
                    tool_outputs = []

                    if not hasattr(run.required_action, 'submit_tool_outputs') or not run.required_action.submit_tool_outputs:
                        logger.error("No submit_tool_outputs in required_action")
                        await client.beta.threads.runs.cancel(
                            thread_id=thread_id,
                            run_id=run_id
                        )
                        return run

                    if not hasattr(run.required_action.submit_tool_outputs, 'tool_calls'):
                        logger.error("No tool_calls in submit_tool_outputs")
                        await client.beta.threads.runs.cancel(
                            thread_id=thread_id,
                            run_id=run_id
                        )
                        return run

                    for tool in run.required_action.submit_tool_outputs.tool_calls:
                        logger.info(f"Processing tool call: {json.dumps(tool.model_dump(), indent=2)}")

                        if tool.type != "function":
                            logger.info("no function tool: %s", tool)
                            continue

                        if tool.function.name == "call_dxa_factory":
                            try:
                                arg = json.loads(tool.function.arguments)
                                logger.info("Processing securities report question: %s", arg['question'])
                                answer = call_dxa_factory(arg['question'])
                                if not answer:
                                    logger.warning("No answer found in securities report")
                                    answer = "申し訳ありません。該当する決算情報が見つかりませんでした。"
                                logger.info("Securities report answer generated successfully")
                                tool_outputs.append({
                                    "tool_call_id": tool.id,
                                    "output": answer,
                                })
                            except Exception as e:
                                logger.error("Error processing securities report question: %s", str(e))
                                tool_outputs.append({
                                    "tool_call_id": tool.id,
                                    "output": "決算情報の処理中にエラーが発生しました。",
                                })

                    # Submit tool outputs if any exist
                    if tool_outputs:
                        try:
                            logger.info(f"Submitting tool outputs: {json.dumps(tool_outputs, indent=2)}")
                            await client.beta.threads.runs.submit_tool_outputs(
                                thread_id=thread_id,
                                run_id=run_id,
                                tool_outputs=tool_outputs
                            )
                            logger.info("Tool outputs submitted successfully.")
                        except Exception as e:
                            logger.error("Failed to submit tool outputs: %s", e)
                            # 失敗した場合は実行をキャンセル
                            await client.beta.threads.runs.cancel(
                                thread_id=thread_id,
                                run_id=run_id
                            )
                            raise
                    else:
                        logger.warning("No tool outputs generated")
                        # ツール出力がない場合は実行をキャンセルして完了
                        await client.beta.threads.runs.cancel(
                            thread_id=thread_id,
                            run_id=run_id
                        )
                        return run

            except Exception as e:
                logger.error(f"Error in generate_message: {str(e)}")
                # エラーが発生した場合は実行をキャンセル
                try:
                    await client.beta.threads.runs.cancel(
                        thread_id=thread_id,
                        run_id=run_id
                    )
                except Exception as cancel_error:
                    logger.error(f"Error cancelling run: {str(cancel_error)}")
                raise

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

    async def initialize_for_asst(self):
        """
        /asstコマンド用の初期化メソッド。
        スレッドは作成せず、アシスタントとベクターストアの初期化のみを行う。
        """
        try:
            # 1. ベクターストアの確認と設定
            if not self.vector_store_id:
                logger.debug("Checking existing vector stores...")
                vector_stores = await client.beta.vector_stores.list()
                if vector_stores.data:
                    self.vector_store_id = vector_stores.data[0].id
                    logger.info(f"Reusing existing vector store: {self.vector_store_id}")
                else:
                    vector_store = await client.beta.vector_stores.create()
                    self.vector_store_id = vector_store.id
                    logger.info(f"New vector store created with ID: {self.vector_store_id}")

            # 2. アシスタントの設定
            if not self.assistant_id:
                env_assistant_id = env.ASSISTANT_ID
                if env_assistant_id:
                    try:
                        existing_assistant = await client.beta.assistants.retrieve(env_assistant_id)
                        self.assistant_id = existing_assistant.id
                        logger.info(f"Using assistant from environment variable: {self.assistant_id}")
                    except Exception as e:
                        logger.warning(f"Failed to retrieve assistant from environment variable: {str(e)}")
                        self.assistant_id = None

                if not self.assistant_id:
                    logger.info("Creating new assistant...")
                    new_assistant = await client.beta.assistants.create(
                        name="Assistant",
                        model=self.model,
                        instructions=self.instructions,
                        tools=TOOLS,
                        tool_resources={"file_search": {"vector_store_ids": [self.vector_store_id]}}
                    )
                    self.assistant_id = new_assistant.id
                    logger.info(f"Created new assistant with ID: {self.assistant_id}")

        except Exception as e:
            logger.error(f"Error during initialization for /asst: {str(e)}")
            raise


# グローバルなアシスタントインスタンスを作成
assistant = Assistant()
