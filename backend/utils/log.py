import logging

# ロギングの設定を強化
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s (%(filename)s:%(lineno)d)'
)
logger = logging.getLogger(__name__)
