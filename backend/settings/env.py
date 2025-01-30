import os
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("OPENAI_API_KEY")
if not API_KEY:
    raise ValueError("OPENAI_API_KEY is not set in environment variables")

ASSISTANT_ID = os.getenv("ASSISTANT_ID")
AIKO_API_DOMAIN = os.getenv("AIKO_API_DOMAIN")
AIKO_API_KEY = os.getenv("AIKO_API_KEY")
AIKO_CONVERSATION_ID = os.getenv("AIKO_CONVERSATION_ID")
