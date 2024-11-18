import React, { useState, useRef, useEffect } from 'react';
import { 
  ThemeProvider, 
  createTheme, 
  CssBaseline,
  Container,
  Paper,
  Box,
  TextField,
  IconButton,
  List,
  ListItem,
  Typography,
  CircularProgress,
  Drawer,
  List as MuiList,
  ListItem as MuiListItem,
  ListItemText,
  Divider,
  ListItemSecondaryAction,
  Button,
  Input,
} from '@mui/material';
import { 
  Send as SendIcon,
  UploadFile as UploadFileIcon,
  Delete as DeleteIcon,
  ImageOutlined as ImageIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import ReactMarkdown, { Components } from 'react-markdown';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface Message {
  text: string;
  isUser: boolean;
  tokenUsage?: TokenUsage;
  images?: string[];
  files?: Array<{
    file_id: string;
    filename: string;
    path: string;
  }>;
}

interface FileInfo {
  file_id: string;
  filename: string;
  id: string;
}

// 初期化関連の型定義
interface VectorStore {
  id: string;
  name: string;
  created_at: number;
}

// 手動でCodePropsの型を定義
interface CustomCodeProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

function App() {
  const [messages, setMessages] = useState<Array<{
    text: string;
    isUser: boolean;
    tokenUsage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    images?: string[];
    files?: Array<{
      file_id: string;
      filename: string;
      path: string;
    }>;
  }>>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [assistantId, setAssistantId] = useState<string>('');
  const [vectorStoreId, setVectorStoreId] = useState<string>('');
  const drawerWidth = 240;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [initializationStatus, setInitializationStatus] = useState<string>('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // システム情報を取得する関数を追加
  const fetchSystemInfo = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/system-info');
      if (!response.ok) {
        throw new Error('Failed to fetch system info');
      }
      const data = await response.json();
      console.log('System info:', data);
      setAssistantId(data.assistant_id);
      setVectorStoreId(data.vector_store_id);
    } catch (error) {
      console.error('Error fetching system info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // ファイル一覧を取得する関数を定義
  const fetchFiles = async () => {
    try {
      const response = await fetch('/api/files');
      if (!response.ok) {
        throw new Error(`Failed to fetch files: ${response.statusText}`);
      }
      const data = await response.json();
      console.log('Files API Response:', data);
      
      if (data.files && Array.isArray(data.files)) {
        setFiles(data.files);
      } else {
        console.warn('Unexpected files data format:', data);
        setFiles([]);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
      setFiles([]);
    }
  };

  // 初期化時にシステム情報とファイル一覧を取得
  useEffect(() => {
    fetchSystemInfo();
    fetchFiles();
  }, []);

  // メッセージ送信処理
  const handleSend = async () => {
    if ((!input.trim() && selectedImages.length === 0) || isLoading) return;
    const currentInput = input.trim();
    
    try {
        setIsLoading(true);
        
        // 画像をOpenAIにアップロードし、URLを取得
        const uploadedImageUrls = await Promise.all(
            selectedImages.map(async (base64Image) => {
                // Base64データからBlobを作成
                const response = await fetch(base64Image);
                const blob = await response.blob();
                
                // FormDataを作成
                const formData = new FormData();
                formData.append('file', blob, 'image.png');
                
                // 画像をアップロード
                const uploadResponse = await fetch('/api/upload-image', {
                    method: 'POST',
                    body: formData,
                });
                
                if (!uploadResponse.ok) {
                    throw new Error('Failed to upload image');
                }
                
                const { url } = await uploadResponse.json();
                return url;
            })
        );

        setMessages(prev => [...prev, { 
            text: currentInput, 
            isUser: true,
            images: selectedImages 
        }]);
        setInput('');
        
        // メッセージのコンテンツを構築
        const content: any[] = [];
        if (currentInput) {
            content.push({
                type: "text",
                text: currentInput
            });
        }
        
        // アップロードされた画像URLを使用
        uploadedImageUrls.forEach(url => {
            content.push({
                type: "image_url",
                image_url: {
                    url: url,
                    detail: "auto"
                }
            });
        });

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
        });
        
        const data = await response.json();
        if (response.ok) {
            setMessages(prev => [...prev, { 
                text: data.text, 
                isUser: false, 
                tokenUsage: data.token_usage 
            }]);
        }
    } catch (error) {
        console.error('Error sending message:', error);
    } finally {
        setIsLoading(false);
        setSelectedImages([]); // 画像選択をリセット
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.[0]) return;
    
    const formData = new FormData();
    formData.append('file', event.target.files[0]);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (response.ok) {
        await fetchFiles();
        event.target.value = '';
      }
    } catch (error) {
      console.error('Error uploading file:', error);
    }
  };

  async function handleDeleteFile(fileId: string) {
    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        console.log(`File with ID ${fileId} deleted successfully.`);
        // ファイル一覧を更新
        await fetchFiles();
        // ファイル一覧の表示を更新
        setFiles(prevFiles => prevFiles.filter(file => file.file_id !== fileId));
      } else {
        const errorData = await response.json();
        console.error(`Failed to delete file with ID ${fileId}:`, errorData);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  }

  // useEffectを修正して、メッセージや画像が追加された後にスクロールを確実に行う
  useEffect(() => {
    const scrollToBottom = () => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    };

    // 画像の読み込みが完了した後にスクロールを行う
    const images = document.querySelectorAll('img');
    let imagesLoaded = 0;

    images.forEach((img) => {
      if (img.complete) {
        imagesLoaded += 1;
      } else {
        img.onload = () => {
          imagesLoaded += 1;
          if (imagesLoaded === images.length) {
            scrollToBottom();
          }
        };
      }
    });

    // 画像がない場合は即座にスクロール
    if (images.length === 0 || imagesLoaded === images.length) {
      scrollToBottom();
    }
  }, [messages, isLoading, selectedImages]); // selectedImagesを依存配列に追加

  const initializeAssistant = async () => {
    try {
      setIsLoading(true);
      setInitializationStatus('Checking existing assistant...');

      // まず既存のアシスタントを確認
      const existingAssistantResponse = await fetch('/api/check-assistant');
      const existingAssistantData = await existingAssistantResponse.json();

      if (existingAssistantData.assistant_id) {
        setAssistantId(existingAssistantData.assistant_id);
        setIsLoading(false);
        return;
      }

      setInitializationStatus('Checking vector stores...');

      // ベクターストアの一覧を取得
      const response = await fetch('/api/vector-stores');
      if (!response.ok) {
        throw new Error('Failed to fetch vector stores');
      }
      const data = await response.json();
      
      // 既存のベクターストアを使用
      if (data.vector_stores && data.vector_stores.length > 0) {
        setVectorStoreId(data.vector_stores[0].id);
        setInitializationStatus('Using existing vector store...');
      }

      setInitializationStatus('Initializing new assistant...');
      const assistantResponse = await fetch('/api/initialize-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vector_store_id: data.vector_stores[0].id,
          model: "gpt-4o"
        }),
      });

      if (!assistantResponse.ok) {
        throw new Error('Failed to initialize assistant');
      }

      const assistantData = await assistantResponse.json();
      setAssistantId(assistantData.assistant_id);
      setInitializationStatus('Initialization complete');

    } catch (error) {
      console.error('Initialization error:', error);
      setInitializationStatus('Initialization failed');
    } finally {
      setIsLoading(false);
    }
  };

  // コンポーネントマウント時に初期化
  useEffect(() => {
    initializeAssistant();
  }, []);

  // 画像選択ハンドラーを追加
  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return;
    
    const newImages: string[] = [];
    for (const file of Array.from(event.target.files)) {
      const reader = new FileReader();
      const imageDataUrl = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      newImages.push(imageDataUrl);
    }
    
    setSelectedImages(prev => [...prev, ...newImages]);
    if (event.target.value) event.target.value = '';
  };

  // ファイルダウンロードハンドラー
  const handleFileDownload = async (fileId: string, filename: string) => {
    try {
        const response = await fetch(`/api/files/${fileId}/download`);
        if (!response.ok) throw new Error('Download failed');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error('Error downloading file:', error);
    }
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        {/* 左サイドナビゲーション - 固定位置 */}
        <Box sx={{ 
          width: 300, 
          minWidth: 300, 
          bgcolor: 'background.paper', 
          borderRight: 1, 
          borderColor: 'divider',
          height: '100vh',
          overflow: 'auto',
          position: 'sticky',
          top: 0
        }}>
          <Box sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>System Info</Typography>
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" color="text.secondary">Assistant ID:</Typography>
              <Typography variant="body2" sx={{ 
                wordBreak: 'break-all',
                color: assistantId ? 'text.primary' : 'text.disabled'
              }}>
                {assistantId || 'Loading...'}
              </Typography>
              
              <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>
                Vector Store ID:
              </Typography>
              <Typography variant="body2" sx={{ 
                wordBreak: 'break-all',
                color: vectorStoreId ? 'text.primary' : 'text.disabled'
              }}>
                {vectorStoreId || 'Loading...'}
              </Typography>
            </Box>

            <Divider sx={{ my: 2 }} />
            
            <Typography variant="h6" gutterBottom>Files</Typography>
            <Button
              variant="contained"
              component="label"
              startIcon={<UploadFileIcon />}
              fullWidth
              sx={{ mb: 2 }}
            >
              Upload File
              <input type="file" hidden onChange={handleFileUpload} />
            </Button>
            
            {files.length > 0 ? (
              <List>
                {files.map((file: FileInfo) => (
                  <ListItem
                    key={file.file_id}
                    sx={{
                      borderBottom: '1px solid',
                      borderColor: 'divider'
                    }}
                    secondaryAction={
                      <IconButton 
                        edge="end" 
                        onClick={() => handleDeleteFile(file.file_id)}
                        aria-label="delete"
                      >
                        <DeleteIcon />
                      </IconButton>
                    }
                  >
                    <ListItemText 
                      primary={file.filename}
                      secondary={`ID: ${file.file_id}`}
                      sx={{ 
                        wordBreak: 'break-all',
                        '& .MuiListItemText-primary': {
                          fontWeight: 'medium'
                        },
                        '& .MuiListItemText-secondary': {
                          fontSize: '0.75rem',
                          opacity: 0.7
                        }
                      }}
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography 
                variant="body2" 
                color="text.secondary"
                sx={{ textAlign: 'center', py: 2 }}
              >
                No files uploaded
              </Typography>
            )}
          </Box>
        </Box>

        {/* メインチャットエリア - スクロール可能 */}
        <Box sx={{ 
          flexGrow: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          height: '100vh',
          overflow: 'hidden'
        }}>
          <Paper sx={{ 
            flexGrow: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            m: 2, 
            p: 2,
            overflow: 'hidden'
          }}>
            <List sx={{ 
              flexGrow: 1, 
              overflow: 'auto', 
              mb: 2,
              '&::-webkit-scrollbar': {
                width: '8px'
              },
              '&::-webkit-scrollbar-track': {
                background: 'transparent'
              },
              '&::-webkit-scrollbar-thumb': {
                background: '#888',
                borderRadius: '4px'
              }
            }}>
              {messages.map((message, index) => (
                <ListItem 
                  key={index} 
                  sx={{ 
                    display: 'flex', 
                    justifyContent: message.isUser ? 'flex-end' : 'flex-start',
                    alignItems: 'flex-start',
                    py: 1
                  }}
                >
                  <Paper 
                    elevation={1} 
                    sx={{ 
                      p: 2, 
                      maxWidth: '70%',
                      bgcolor: message.isUser ? 'primary.main' : 'background.paper',
                      color: message.isUser ? 'primary.contrastText' : 'text.primary'
                    }}
                  >
                    {message.text && (
                      message.isUser ? (
                        <Typography sx={{ whiteSpace: 'pre-wrap' }}>{message.text}</Typography>
                      ) : (
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => (
                              <Typography component="p" sx={{ mt: 1, mb: 1 }}>
                                {children}
                              </Typography>
                            ),
                            code: ({ inline, className, children }: CustomCodeProps) => {
                              const match = /language-(\w+)/.exec(className || '');
                              return !inline ? (
                                <Box
                                  component="pre"
                                  sx={{
                                    backgroundColor: 'rgba(0, 0, 0, 0.1)',
                                    p: 2,
                                    borderRadius: 1,
                                    overflow: 'auto',
                                    '& code': {
                                      fontFamily: 'monospace'
                                    }
                                  }}
                                >
                                  <code className={className}>
                                    {children}
                                  </code>
                                </Box>
                              ) : (
                                <code className={className}>
                                  {children}
                                </code>
                              );
                            },
                            h1: ({ children }) => (
                              <Typography variant="h4" component="h1" sx={{ mt: 2, mb: 1 }}>
                                {children}
                              </Typography>
                            ),
                            h2: ({ children }) => (
                              <Typography variant="h5" component="h2" sx={{ mt: 2, mb: 1 }}>
                                {children}
                              </Typography>
                            ),
                            h3: ({ children }) => (
                              <Typography variant="h6" component="h3" sx={{ mt: 2, mb: 1 }}>
                                {children}
                              </Typography>
                            ),
                            ul: ({ children }) => (
                              <Box component="ul" sx={{ mt: 1, mb: 1, pl: 3 }}>
                                {children}
                              </Box>
                            ),
                            ol: ({ children }) => (
                              <Box component="ol" sx={{ mt: 1, mb: 1, pl: 3 }}>
                                {children}
                              </Box>
                            ),
                            li: ({ children }) => (
                              <Box component="li" sx={{ mt: 0.5 }}>
                                <Typography component="span">{children}</Typography>
                              </Box>
                            ),
                            blockquote: ({ children }) => (
                              <Box
                                component="blockquote"
                                sx={{
                                  borderLeft: 4,
                                  borderColor: 'primary.main',
                                  pl: 2,
                                  py: 1,
                                  my: 1,
                                  bgcolor: 'rgba(0, 0, 0, 0.1)',
                                  borderRadius: 1
                                }}
                              >
                                {children}
                              </Box>
                            ),
                          }}
                        >
                          {message.text}
                        </ReactMarkdown>
                      )
                    )}
                    {message.images && message.images.length > 0 && (
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                        {message.images.map((image, imgIndex) => (
                          <Box
                            key={imgIndex}
                            component="img"
                            src={image}
                            sx={{
                              maxWidth: '200px',
                              maxHeight: '200px',
                              objectFit: 'contain',
                              borderRadius: 1
                            }}
                          />
                        ))}
                      </Box>
                    )}
                    {message.files && message.files.length > 0 && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          Generated Files:
                        </Typography>
                        <List dense>
                          {message.files.map((file) => (
                            <ListItem key={file.file_id}>
                              <Button
                                startIcon={<DownloadIcon />}
                                size="small"
                                onClick={() => handleFileDownload(file.file_id, file.filename)}
                              >
                                {file.filename}
                              </Button>
                            </ListItem>
                          ))}
                        </List>
                      </Box>
                    )}
                    {message.tokenUsage && (
                      <Typography variant="caption" sx={{ mt: 1, display: 'block', opacity: 0.7 }}>
                        Tokens: {message.tokenUsage.total_tokens} 
                        (Prompt: {message.tokenUsage.prompt_tokens}, 
                        Completion: {message.tokenUsage.completion_tokens})
                      </Typography>
                    )}
                  </Paper>
                </ListItem>
              ))}
              {isLoading && (
                <ListItem sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <Paper 
                    elevation={1} 
                    sx={{ 
                      p: 2, 
                      maxWidth: '70%',
                      bgcolor: 'background.paper',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1
                    }}
                  >
                    <CircularProgress size={20} />
                    <Typography>Thinking...</Typography>
                  </Paper>
                </ListItem>
              )}
              <div ref={messagesEndRef} />
            </List>
            
            {selectedImages.length > 0 && (
              <Box sx={{ 
                display: 'flex', 
                gap: 1, 
                p: 2, 
                flexWrap: 'wrap',
                borderTop: 1,
                borderColor: 'divider',
                mb: 2
              }}>
                {selectedImages.map((image, index) => (
                  <Box
                    key={index}
                    component="img"
                    src={image}
                    sx={{
                      width: 100,
                      height: 100,
                      objectFit: 'cover',
                      borderRadius: 1
                    }}
                  />
                ))}
              </Box>
            )}

            <Box sx={{ 
              display: 'flex', 
              gap: 1,
              borderTop: selectedImages.length === 0 ? 1 : 0,
              borderColor: 'divider',
              pt: 2
            }}>
              <TextField
                inputRef={inputRef}
                fullWidth
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                multiline
                maxRows={4}
                disabled={isLoading}
                autoFocus
                sx={{ 
                  '& .MuiInputBase-input': { 
                    color: isLoading ? 'text.secondary' : 'inherit'
                  },
                  '& .Mui-disabled': {
                    WebkitTextFillColor: 'inherit',
                    color: 'text.secondary'
                  }
                }}
              />
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                ref={imageInputRef}
                onChange={handleImageSelect}
              />
              <IconButton
                onClick={() => imageInputRef.current?.click()}
                color={selectedImages.length > 0 ? "primary" : "default"}
              >
                <ImageIcon />
              </IconButton>
              <IconButton 
                onClick={handleSend} 
                disabled={isLoading || (!input.trim() && selectedImages.length === 0)}
                color="primary"
              >
                <SendIcon />
              </IconButton>
            </Box>
          </Paper>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App; 