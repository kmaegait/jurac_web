import React, { useState, useRef, useEffect } from 'react';
import { 
  ThemeProvider, 
  createTheme, 
  CssBaseline,
  Paper,
  Box,
  TextField,
  IconButton,
  List,
  ListItem,
  Typography,
  CircularProgress,
  ListItemText,
  Divider,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import { 
  Send as SendIcon,
  UploadFile as UploadFileIcon,
  Delete as DeleteIcon,
  ImageOutlined as ImageIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
});

// FileInfoインターフェースを追加
interface FileInfo {
  file_id: string;
  filename: string;
  path: string;
}

// 手動でCodePropsの型を定義
interface CustomCodeProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

// ImageDetailLevel型を追加
type ImageDetailLevel = 'low' | 'high' | 'auto';

// インターフェースの定義を追加
interface RunStep {
  type: string;
  step_details: {
    tool_calls?: Array<{
      type: string;
      code_interpreter?: {
        input: string;
        outputs: Array<{
          type: string;
          logs?: string;
          image?: {
            file_id: string;
          };
        }>;
      };
    }>;
  };
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
    runSteps?: RunStep[];  // 追加
  }>>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [assistantId, setAssistantId] = useState<string>('');
  const [vectorStoreId, setVectorStoreId] = useState<string>('');
  const [initializationStatus, setInitializationStatus] = useState<string>('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageDetailLevel, setImageDetailLevel] = useState<ImageDetailLevel>('auto');
  const [isDragging, setIsDragging] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isUploading, setIsUploading] = useState(false);

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
                const response = await fetch(base64Image);
                const blob = await response.blob();
                
                const formData = new FormData();
                formData.append('file', blob, 'image.png');
                
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
        
        const content: any[] = [];
        if (currentInput) {
            content.push({
                type: "text",
                text: currentInput
            });
        }
        
        // アップロードされた画像URLにdetailレベルを設定
        uploadedImageUrls.forEach(url => {
            content.push({
                type: "image_url",
                image_url: {
                    url: url,
                    detail: imageDetailLevel  // detailレベルを設定
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
                tokenUsage: data.token_usage,
                runSteps: data.run_steps  // 追加
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
      setIsUploading(true);  // アップロード開始
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
    } finally {
      setIsUploading(false);  // アップロード完了
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

  // useEffectを修正して、メッセージや画像が追加さた後にクロールを確実にう
  useEffect(() => {
    const scrollToBottom = () => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    };

    // 画像の読み込みが完了した後にスクロールを行
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

    // 画ない場合は即座にスクロール
    if (images.length === 0 || imagesLoaded === images.length) {
      scrollToBottom();
    }
  }, [messages, isLoading, selectedImages]); // selectedImagesを依存配列に追加

  const initializeAssistant = async () => {
    try {
      setIsLoading(true);
      setInitializationStatus('Initializing...');

      // システム情報を取得
      const response = await fetch('/api/system-info');
      if (!response.ok) {
        throw new Error('Failed to fetch system info');
      }
      const data = await response.json();
      
      if (data.assistant_id && data.vector_store_id) {
        setAssistantId(data.assistant_id);
        setVectorStoreId(data.vector_store_id);
        setInitializationStatus('Initialization successful');
      } else {
        throw new Error('Failed to initialize assistant');
      }

    } catch (error) {
      console.error('Initialization error:', error);
      setInitializationStatus(
        `Initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  // コンポーネントマウント時に初期化
  useEffect(() => {
    initializeAssistant();
  }, []);

  // ドラッグ&ドロップハンドラーを修正
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // ドロップゾーンの直接の子要素からのイベントのみを処理
    if (e.target === dropZoneRef.current || dropZoneRef.current?.contains(e.target as Node)) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // マウスがドロップゾーンから実際に出た時のみ状態を更新
    if (e.target === dropZoneRef.current) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // ドラッグオーバー中は常にドラッグ状態を維持
    if (!isDragging && (e.target === dropZoneRef.current || dropZoneRef.current?.contains(e.target as Node))) {
      setIsDragging(true);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // ドロップゾーン内でのドロップのみを処理
    if (e.target === dropZoneRef.current || dropZoneRef.current?.contains(e.target as Node)) {
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      await processImageFiles(files);
    }
  };

  // 画像ファイル処理関数
  const processImageFiles = async (files: File[]) => {
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
      console.warn('No valid image files found');
      return;
    }

    const newImages = await Promise.all(
      imageFiles.map(file => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve(reader.result as string);
          };
          reader.readAsDataURL(file);
        });
      })
    );

    setSelectedImages(prev => [...prev, ...newImages]);
  };

  // クリックでの画像選択ハンドラーを修正
  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return;
    await processImageFiles(Array.from(event.target.files));
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

  // メッセージ更新後にフォーカスを設定するuseEffectを追加
  useEffect(() => {
    inputRef.current?.focus();
  }, [messages]);

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
            {initializationStatus && (
              <Typography 
                variant="body2" 
                color={initializationStatus.includes('failed') ? 'error' : 'text.secondary'} 
                sx={{ mb: 2 }}
              >
                Status: {initializationStatus}
              </Typography>
            )}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" color="text.secondary">Assistant ID:</Typography>
              <Typography variant="body2" sx={{ 
                wordBreak: 'break-all',
                color: assistantId ? 'text.primary' : 'error.main'
              }}>
                {assistantId || 'Not initialized'}
              </Typography>
              
              <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>
                Vector Store ID:
              </Typography>
              <Typography variant="body2" sx={{ 
                wordBreak: 'break-all',
                color: vectorStoreId ? 'text.primary' : 'error.main'
              }}>
                {vectorStoreId || 'Not initialized'}
              </Typography>
            </Box>
            
            {/* 再初期化ボタンを追加 */}
            {(initializationStatus.includes('failed') || !assistantId) && (
              <Button 
                variant="contained" 
                color="primary" 
                onClick={initializeAssistant}
                disabled={isLoading}
                fullWidth
                sx={{ mb: 2 }}
              >
                Retry Initialization
              </Button>
            )}

            <Divider sx={{ my: 2 }} />

            <Typography variant="h6" gutterBottom>Files</Typography>
            <Button
              variant="contained"
              component="label"
              startIcon={isUploading ? <CircularProgress size={20} color="inherit" /> : <UploadFileIcon />}
              fullWidth
              sx={{ mb: 2 }}
              disabled={isUploading}
            >
              {isUploading ? 'Uploading...' : 'Upload File'}
              <input 
                type="file" 
                hidden 
                onChange={handleFileUpload}
                disabled={isUploading}
              />
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
          overflow: 'hidden',
          position: 'relative'
        }}>
          <Paper 
            ref={dropZoneRef}
            sx={{ 
              flexGrow: 1, 
              display: 'flex', 
              flexDirection: 'column', 
              m: 2, 
              p: 2,
              overflow: 'hidden',
              border: isDragging ? '2px dashed' : '1px solid',
              borderColor: isDragging ? 'primary.main' : 'divider',
              transition: 'all 0.2s ease',
              backgroundColor: isDragging ? 'rgba(25, 118, 210, 0.08)' : 'background.paper',
            }}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
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
                    {message.text && !message.isUser ? (
                      <>
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => (
                              <Typography 
                                component="div"
                                sx={{ 
                                  mt: 1, 
                                  mb: 1,
                                  whiteSpace: 'pre-wrap'
                                }}
                              >
                                {children}
                              </Typography>
                            ),
                            code: ({ inline, className, children }: CustomCodeProps) => {
                              const match = /language-(\w+)/.exec(className || '');
                              return !inline ? (
                                <Box
                                  component="pre"
                                  sx={{
                                    backgroundColor: match ? 'rgba(0, 0, 0, 0.1)' : 'rgba(0, 0, 0, 0.05)',
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
                        
                        {/* コードインタプリタの実行結果を表示 */}
                        {message.runSteps && message.runSteps.map((step, stepIndex) => {
                          if (step.type === "tool_calls" && step.step_details.tool_calls) {
                            return step.step_details.tool_calls.map((toolCall, toolIndex) => {
                              if (toolCall.type === "code_interpreter" && toolCall.code_interpreter) {
                                return (
                                  <Box key={`${stepIndex}-${toolIndex}`} sx={{ mt: 2 }}>
                                    <Typography variant="subtitle2" color="text.secondary">
                                      Code Execution:
                                    </Typography>
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
                                      <code>
                                        {toolCall.code_interpreter.input}
                                      </code>
                                    </Box>
                                    {toolCall.code_interpreter.outputs.map((output, outputIndex) => (
                                      <Box key={outputIndex} sx={{ mt: 1 }}>
                                        {output.logs && (
                                          <Box
                                            component="pre"
                                            sx={{
                                              backgroundColor: 'rgba(0, 0, 0, 0.05)',
                                              p: 2,
                                              borderRadius: 1,
                                              overflow: 'auto',
                                              '& code': {
                                                fontFamily: 'monospace'
                                              }
                                            }}
                                          >
                                            <code>
                                              {output.logs}
                                            </code>
                                          </Box>
                                        )}
                                      </Box>
                                    ))}
                                  </Box>
                                );
                              }
                              return null;
                            });
                          }
                          return null;
                        })}
                      </>
                    ) : (
                      <>
                        {message.images && message.images.length > 0 && (
                          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: message.text ? 2 : 0 }}>
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
                        {message.text && (
                          <Typography 
                            sx={{ 
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word'
                            }}
                          >
                            {message.text}
                          </Typography>
                        )}
                      </>
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
            
            {/* 選択された画像のプレビュー */}
            {selectedImages.length > 0 && (
              <Box sx={{ 
                mb: 2,
                p: 2,
                borderRadius: 1,
                bgcolor: 'background.default',
              }}>
                <Box sx={{ 
                  display: 'flex',
                  gap: 1,
                  flexWrap: 'wrap',
                  mb: 2,
                }}>
                  {selectedImages.map((image, index) => (
                    <Box
                      key={index}
                      sx={{
                        position: 'relative',
                        '&:hover .delete-button': {
                          opacity: 1,
                        },
                      }}
                    >
                      <Box
                        component="img"
                        src={image}
                        sx={{
                          width: 100,
                          height: 100,
                          objectFit: 'cover',
                          borderRadius: 1
                        }}
                      />
                      <IconButton
                        className="delete-button"
                        size="small"
                        sx={{
                          position: 'absolute',
                          top: -8,
                          right: -8,
                          opacity: 0,
                          transition: 'opacity 0.2s ease',
                          backgroundColor: 'background.paper',
                          boxShadow: 1,
                          '&:hover': {
                            backgroundColor: 'action.hover',
                          },
                        }}
                        onClick={() => setSelectedImages(prev => prev.filter((_, i) => i !== index))}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
                
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <Typography variant="body2" color="text.secondary">
                    {selectedImages.length} image{selectedImages.length > 1 ? 's' : ''} selected
                  </Typography>
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel id="detail-level-label">Detail Level</InputLabel>
                    <Select
                      labelId="detail-level-label"
                      value={imageDetailLevel}
                      label="Detail Level"
                      onChange={(e) => setImageDetailLevel(e.target.value as ImageDetailLevel)}
                    >
                      <MenuItem value="low">Low</MenuItem>
                      <MenuItem value="high">High</MenuItem>
                      <MenuItem value="auto">Auto</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              </Box>
            )}

            {/* 入力エリア */}
            <Box sx={{ 
              display: 'flex', 
              gap: 1,
              mt: 'auto',
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
                placeholder={isDragging ? "Drop images here..." : (selectedImages.length > 0 ? "Add a message or press send" : "Type a message...")}
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
                disabled={isLoading}
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