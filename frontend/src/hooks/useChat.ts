import { useState, useCallback } from 'react';
import { Message, ImageDetailLevel } from '../types';

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [imageDetailLevel, setImageDetailLevel] = useState<ImageDetailLevel>('auto');

  const sendMessage = useCallback(async () => {
    if ((!input.trim() && selectedImages.length === 0) || isLoading) return;
    const currentInput = input.trim();
    
    try {
      setIsLoading(true);
      
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
      
      uploadedImageUrls.forEach(url => {
        content.push({
          type: "image_url",
          image_url: {
            url: url,
            detail: imageDetailLevel
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
          runSteps: data.run_steps
        }]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsLoading(false);
      setSelectedImages([]);
    }
  }, [input, selectedImages, isLoading, imageDetailLevel]);

  return {
    messages,
    input,
    setInput,
    isLoading,
    selectedImages,
    setSelectedImages,
    imageDetailLevel,
    setImageDetailLevel,
    sendMessage
  };
}; 