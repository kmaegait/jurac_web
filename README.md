# JURAC Web Interface

A full-stack web application featuring OpenAI API integration and file management capabilities.

## Key Features

- Real-time chat interface with AI assistant
- File upload and management system
- Image upload and processing
- Markdown rendering for chat messages
- Token usage tracking
- Dark mode UI
- File download functionality
- Vector store integration for enhanced context understanding

## Requirements

- Node.js (v18 or later recommended)
- Python (3.10 or later)
- OpenAI API key

## Environment Variables

Create a `.env` file in the root directory and set the following variables:

```
OPENAI_API_KEY=your_openai_api_key
ASSISTANT_ID=your_assistant_id (optional)
AIKO_API_DOMAIN=your_aiko_api_domain
AIKO_API_KEY=your_aiko_api_key
AIKO_CONVERSATION_ID=your_aiko_conversation_id
```

## Installation

### Backend Setup

1. Create and activate Python virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install Python dependencies:
```bash
pip install fastapi uvicorn python-dotenv openai aiofiles python-multipart requests pyyaml
```

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install Node.js dependencies:
```bash
npm install
```

## Project Structure

```
├── backend/
│   ├── endpoints/         # API endpoint implementations
│   ├── services/         # Business logic
│   ├── settings/        # Configuration files
│   ├── utils/           # Utility functions
│   ├── downloaded_files/ # Downloaded files storage
│   ├── main.py          # FastAPI application
│   └── instructions.yaml # Assistant configuration
├── frontend/
│   ├── public/          # Static files
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── hooks/      # Custom hooks
│   │   ├── types/     # TypeScript definitions
│   │   ├── App.tsx    # Main application
│   │   └── index.tsx  # Entry point
│   ├── package.json    # Frontend dependencies
│   └── tsconfig.json   # TypeScript configuration
└── README.md
```

## Running the Application

1. Start the backend server:
```bash
# From backend directory
uvicorn main:app --reload --port 8000
```

2. Start the frontend development server:
```bash
# From frontend directory
npm start
```

The application will be accessible at `http://localhost:3000`

## Core Dependencies

### Backend
- FastAPI - High-performance web framework
- OpenAI - AI model integration
- Python-dotenv - Environment variable management
- Uvicorn - ASGI server
- Aiofiles - Asynchronous file operations
- PyYAML - YAML configuration file processing

### Frontend
- React 18
- TypeScript 4.9
- Material-UI (MUI) v5
- React Markdown
- Emotion (Styling)
- HTTP Proxy Middleware

## API Endpoints

### Chat
- `POST /api/chat` - Interact with AI assistant

### File Management
- `GET /api/files` - Get file list
- `POST /api/upload` - Upload file
- `DELETE /api/files/{file_id}` - Delete file
- `GET /api/files/{file_id}/download` - Download file
- `DELETE /api/files` - Delete all files

### System
- `GET /api/system-info` - Get system information
- `POST /api/initialize-assistant` - Initialize assistant
- `GET /api/check-assistant` - Check assistant status
- `GET /api/vector-stores` - List vector stores

### Image Processing
- `POST /api/upload-image` - Upload chat image

## Security Measures

- Secure management of sensitive information using environment variables
- Proper CORS policy configuration
- File upload validation
- Comprehensive error handling implementation

## Limitations

- OpenAI API key required
- Supported image formats: JPEG, PNG, GIF, WEBP
- Python 3.10 or later required
- Node.js v18 or later recommended

## Troubleshooting

1. API Errors
   - Verify environment variables configuration
   - Check OpenAI API key validity

2. File Operation Errors
   - Check directory permissions
   - Verify file size limits

3. Connection Issues
   - Confirm backend server is running
   - Verify proxy settings