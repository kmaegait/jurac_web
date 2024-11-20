import { useState, useCallback } from 'react';

export const useSystemInfo = () => {
  const [assistantId, setAssistantId] = useState<string>('');
  const [vectorStoreId, setVectorStoreId] = useState<string>('');
  const [initializationStatus, setInitializationStatus] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(false);

  const initializeAssistant = useCallback(async () => {
    try {
      setIsInitializing(true);
      setInitializationStatus('Initializing...');

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
      setIsInitializing(false);
    }
  }, []);

  return {
    assistantId,
    vectorStoreId,
    initializationStatus,
    isInitializing,
    initializeAssistant
  };
}; 