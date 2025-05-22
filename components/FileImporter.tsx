
import React, { useState, useCallback } from 'react';
import type { ImportedStoryFormat } from '../types';
import { UploadIcon } from './icons';

interface FileImporterProps {
  onFileLoad: (data: ImportedStoryFormat) => void;
  onProcessingError: (error: string) => void;
}

const FileImporter: React.FC<FileImporterProps> = ({ onFileLoad, onProcessingError }) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const processFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        if (event.target && typeof event.target.result === 'string') {
          const parsedData = JSON.parse(event.target.result) as ImportedStoryFormat;
          // Basic validation
          if (!parsedData.Analysis || !parsedData["The Complete Story"] || !parsedData["The Complete Story"].Title) {
            throw new Error("Invalid story format: Missing required fields.");
          }
          if (!Array.isArray(parsedData.Analysis)) {
             throw new Error("Invalid story format: 'Analysis' must be an array.");
          }
          onFileLoad(parsedData);
          setFileName(file.name);
        } else {
          throw new Error("Failed to read file content.");
        }
      } catch (e: any) {
        onProcessingError(`Error parsing JSON: ${e.message}`);
        setFileName(null);
      }
    };
    reader.onerror = () => {
      onProcessingError("Error reading file.");
      setFileName(null);
    };
    reader.readAsText(file);
  }, [onFileLoad, onProcessingError]);
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      processFile(event.target.files[0]);
    }
  };

  const handleDrop = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      if (event.dataTransfer.files[0].type === "application/json") {
        processFile(event.dataTransfer.files[0]);
      } else {
        onProcessingError("Invalid file type. Please upload a JSON file.");
      }
    }
  }, [processFile, onProcessingError]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  return (
    <div className="w-full p-6 bg-slate-800 rounded-lg shadow-xl">
      <label
        htmlFor="file-upload"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer 
                    ${isDragging ? 'border-sky-400 bg-slate-700' : 'border-slate-600 hover:border-sky-500 hover:bg-slate-700'} 
                    transition-colors duration-200 ease-in-out`}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <UploadIcon className={`w-10 h-10 mb-3 ${isDragging ? 'text-sky-400' : 'text-slate-400'}`} />
          <p className={`mb-2 text-sm ${isDragging ? 'text-sky-300' : 'text-slate-400'}`}>
            <span className="font-semibold">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-slate-500">JSON story file</p>
          {fileName && <p className="mt-2 text-xs text-green-400">Loaded: {fileName}</p>}
        </div>
        <input id="file-upload" type="file" accept=".json" className="hidden" onChange={handleFileChange} />
      </label>
    </div>
  );
};

export default FileImporter;
    