import { useState, useCallback, useEffect } from 'react';
import { FileInfo } from '../types';

export const useFileManager = () => {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const fetchFiles = useCallback(async () => {
    try {
      const response = await fetch('/api/files');
      if (!response.ok) {
        throw new Error(`Failed to fetch files: ${response.statusText}`);
      }
      const data = await response.json();
      
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
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    if (isUploading) return false;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setIsUploading(true);
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.message !== "File uploaded successfully") {
        throw new Error('Unexpected server response');
      }

      await fetchFiles();
      return true;
    } catch (error) {
      console.error('Error uploading file:', error);
      return false;
    } finally {
      setIsUploading(false);
    }
  }, [fetchFiles, isUploading]);

  const deleteFile = useCallback(async (fileId: string) => {
    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`Delete failed: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.message !== "File deleted successfully") {
        throw new Error('Unexpected server response');
      }

      await fetchFiles();
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }, [fetchFiles]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  return {
    files,
    isUploading,
    fetchFiles,
    uploadFile,
    deleteFile
  };
}; 