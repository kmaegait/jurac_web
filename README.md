# JURAC Webインターフェース

OpenAIのAPIを統合した、ファイル管理機能を備えたフルスタックWebアプリケーションです。

## 主な機能

- AIアシスタントによるリアルタイムチャットインターフェース
- ファイルのアップロードと管理システム
- 画像のアップロードと処理
- チャットメッセージのMarkdownレンダリング
- トークン使用量の追跡
- ダークモードUI
- ファイルのダウンロード機能
- 文脈理解を強化するベクターストアの統合

## 必要条件

- Node.js (v14以降)
- Python (3.10以降)
- OpenAI APIキー

## 環境変数

ルートディレクトリに`.env`ファイルを作成し、以下の変数を設定してください：

```
OPENAI_API_KEY=your_openai_api_key
ASSISTANT_ID=your_assistant_id (オプション)
```

## インストール手順

### バックエンド設定

1. Pythonの仮想環境を作成し、有効化します：
```bash
python -m venv venv
source venv/bin/activate  # Windowsの場合: venv\Scripts\activate
```

2. Python依存パッケージのインストール：
```bash
pip install fastapi uvicorn python-dotenv openai aiofiles
```

### フロントエンド設定

1. Node.js依存パッケージのインストール：
```bash
npm install
```

## プロジェクト構造

```
├── backend/
│   └── main.py                 # FastAPIバックエンドサーバー
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # メインReactアプリケーション
│   │   ├── index.tsx          # Reactエントリーポイント
│   │   └── index.css          # グローバルスタイル
│   └── setupProxy.js          # 開発用プロキシ設定
└── README.md
```

## アプリケーションの実行

1. バックエンドサーバーの起動：
```bash
# ルートディレクトリから
uvicorn main:app --reload --port 8000
```

2. フロントエンド開発サーバーの起動：
```bash
# フロントエンドディレクトリから
npm start
```

アプリケーションは `http://localhost:3000` でアクセスできます。

## APIエンドポイント

### チャット
- `POST /api/chat` - AIアシスタントにメッセージを送信

### ファイル管理
- `GET /api/files` - アップロードされたファイル一覧の取得
- `POST /api/upload` - 新規ファイルのアップロード
- `DELETE /api/files/{file_id}` - 特定のファイルの削除
- `GET /api/files/{file_id}/download` - 特定のファイルのダウンロード
- `DELETE /api/files` - 全ファイルの削除

### システム
- `GET /api/system-info` - システム情報の取得
- `POST /api/initialize-assistant` - AIアシスタントの初期化
- `GET /api/check-assistant` - アシスタントの状態確認
- `GET /api/vector-stores` - ベクターストアの一覧取得

### 画像処理
- `POST /api/upload-image` - チャット用画像のアップロード

## 使用技術

### バックエンド
- FastAPI
- OpenAI API
- Python-dotenv
- Uvicorn
- Aiofiles

### フロントエンド
- React
- TypeScript
- Material-UI
- React Markdown
- HTTP Proxy Middleware

## 開発メモ

- OpenAIの最新APIを使用（ベクターストアとアシスタントを含む）
- アップロードされたファイルはOpenAIシステムとベクターストアの両方に保存
- チャットインターフェースはテキストと画像の入力に対応
- アシスタントの応答ごとにトークン使用量を表示
- メッセージ間で会話コンテキストを維持

## エラーハンドリング

以下の状況に対する包括的なエラーハンドリングを実装：
- API通信の問題
- ファイルのアップロード/ダウンロードの失敗
- アシスタント初期化の問題
- ベクターストアの操作

## セキュリティ対策

- バックエンドでCORSを設定
- APIキーは環境変数で管理
- ファイル操作は適切なエラーハンドリングを伴う安全な処理

## 制限事項

- 適切な権限を持つOpenAI APIキーが必要
- 画像処理は対応フォーマットのみ（JPEG、PNG、GIF、WEBP）
- ベクターストアの操作はOpenAIのサービス可用性に依存
- Python 3.10以降が必要（古いバージョンでは動作しません）