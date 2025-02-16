import { useState, useCallback } from 'react';
import { DxaResponse, Message, ImageDetailLevel } from '../types';

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [imageDetailLevel, setImageDetailLevel] = useState<ImageDetailLevel>('auto');
  const [thinkingText, setThinkingText] = useState<string>("Thinking...");
  const [dxaResponse, setDxaResponse] = useState<DxaResponse | null>(null);

  const processStream = async (response: Response) => {
    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          
          try {
            const event = JSON.parse(line);
            switch (event.type) {
              case 'thinking':
                setThinkingText(event.data);
                break;
              case 'function_call':
                setThinkingText(event.data);
                break;
              case 'dxa_factory':
                const dxaResponse: DxaResponse = event.data;
                setDxaResponse(dxaResponse);
                console.log('DXA Response:', dxaResponse);
                break;
              case 'complete':
                console.log('Complete event data:', event.data);
                console.log('isDxaResponse:', event.data.isDxaResponse);
                setMessages(prev => [...prev, {
                  text: event.data.text,
                  isUser: false,
                  tokenUsage: event.data.token_usage,
                  files: event.data.files,
                  isDxaResponse: event.data.isDxaResponse
                }]);
                break;
            }
            console.log('Event data:', event.data);
            console.log('isFunctionCall:', event.data.is_function_call);
          } catch (e) {
            console.error('Error parsing event:', e);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  };

  const sendMessage = useCallback(async () => {
    if ((!input.trim() && selectedImages.length === 0) || isLoading) return;
    
    try {
      setIsLoading(true);
      setThinkingText("Thinking...");
      
      const currentInput = input.trim();

      // 画像のアップロード処理
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

      // メッセージの作成
      const content: any[] = [];
      if (currentInput) {
        content.push({
          type: "text",
          text: currentInput
        });
      }
      
      uploadedImageUrls.forEach(url => {
        content.push({
          type: "image_url",
          image_url: {
            url: url,
            detail: imageDetailLevel
          }
        });
      });

      setMessages(prev => [...prev, { 
        text: currentInput, 
        isUser: true,
        images: selectedImages 
      }]);
      setInput('');
      setSelectedImages([]);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: currentInput,
          content: content
        }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      await processStream(response);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        text: 'エラーが発生しました。もう一度お試しください。',
        isUser: false,
      }]);
    } finally {
      setIsLoading(false);
      setThinkingText("Thinking...");
    }
  }, [input, selectedImages, isLoading, imageDetailLevel]);

  const clearMessages = () => {
    setMessages([]);
    setInput('');
    setSelectedImages([]);
    setDxaResponse(null);
  };

  return {
    messages,
    input,
    setInput,
    isLoading,
    selectedImages,
    setSelectedImages,
    imageDetailLevel,
    setImageDetailLevel,
    thinkingText,
    dxaResponse,
    setDxaResponse,
    sendMessage,
    clearMessages,
  };
}; 