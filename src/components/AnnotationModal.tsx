
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { AnalysisItem, CommentObject, EditMode } from '../types';
import { XMarkIcon, CheckIcon, TrashIcon, UserIcon, UsersIcon, EditIcon as PencilIcon, MicrophoneIcon, PencilSquareIcon } from './icons';

// SpeechRecognition API might be prefixed
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
let recognition: any | null = null;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US'; // You might want to make this configurable
}


interface AnnotationModalProps {
  isOpen: boolean;
  item: AnalysisItem | null;
  onSaveOrUpdateComment: (commentText: string, editingCommentDetail: { id: string; groupId?: string } | null) => void;
  onDeleteComment: (itemId: string, commentId: string) => void;
  onClose: () => void;
  editMode: EditMode;
  bulkSelectionCount: number;
}

const AnnotationModal: React.FC<AnnotationModalProps> = ({ 
    isOpen, item, onSaveOrUpdateComment, onDeleteComment, onClose, editMode, bulkSelectionCount 
}) => {
  const [newCommentText, setNewCommentText] = useState('');
  const [editingCommentDetail, setEditingCommentDetail] = useState<{ id: string; groupId?: string } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const newCommentTextareaRef = useRef<HTMLTextAreaElement>(null);


  useEffect(() => {
    if (isOpen) {
      setNewCommentText(''); 
      setEditingCommentDetail(null);
      setSpeechError(null);
      // Autofocus logic:
      // If it's a bulk mode new comment, or single mode with no existing comments, or not editing an existing one.
      if (isBulkModeNewComment || (item && item.comments.length === 0 && !editingCommentDetail)) {
        setTimeout(() => newCommentTextareaRef.current?.focus(), 100); // Delay to ensure modal is rendered
      }
    } else {
        if (recognition && isRecording) {
            recognition.stop();
            setIsRecording(false);
        }
    }
  }, [isOpen, item, editMode, bulkSelectionCount]); // Added editMode, bulkSelectionCount as they influence autofocus condition


  const handleSaveOrUpdate = useCallback(() => {
    if (newCommentText.trim() === '') return;
    onSaveOrUpdateComment(newCommentText.trim(), editingCommentDetail);
    setNewCommentText(''); 
    setEditingCommentDetail(null);
    // Modal closure is handled by parent `App.tsx` after successful save/update
  }, [newCommentText, editingCommentDetail, onSaveOrUpdateComment]);

  const handleDelete = useCallback((commentId: string) => {
    if (item) { 
      onDeleteComment(item.id, commentId);
      // If the deleted comment was being edited, reset edit state
      if (editingCommentDetail && editingCommentDetail.id === commentId) {
        setNewCommentText('');
        setEditingCommentDetail(null);
      }
    }
  }, [item, onDeleteComment, editingCommentDetail]);

  const handleEditComment = useCallback((comment: CommentObject) => {
    setNewCommentText(comment.text);
    setEditingCommentDetail({ id: comment.id, groupId: comment.groupId });
    setSpeechError(null);
    newCommentTextareaRef.current?.focus();
  }, []);
  
  const handleToggleRecording = () => {
    if (!recognition) {
      setSpeechError("Speech recognition is not supported by your browser.");
      return;
    }
    if (isRecording) {
      recognition.stop();
      setIsRecording(false);
    } else {
      setSpeechError(null);
      try {
        recognition.start();
        setIsRecording(true);
      } catch (e) {
        console.error("Speech recognition start error:", e);
        setSpeechError("Could not start recording. Make sure microphone access is allowed.");
        setIsRecording(false);
      }
    }
  };

  useEffect(() => {
    if (!recognition) return;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setNewCommentText(prev => prev ? `${prev} ${transcript}` : transcript);
      setIsRecording(false); 
    };
    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === 'no-speech') {
        setSpeechError("No speech was detected.");
      } else if (event.error === 'audio-capture') {
        setSpeechError("Microphone problem. Ensure it's enabled and permitted.");
      } else if (event.error === 'not-allowed') {
        setSpeechError("Microphone access was denied.");
      } else {
        setSpeechError(`Error: ${event.error}`);
      }
      setIsRecording(false);
    };
    recognition.onend = () => {
      setIsRecording(false); // Ensure recording state is reset
    };
    
    return () => { // Cleanup
        if (recognition) {
            recognition.onresult = null;
            recognition.onerror = null;
            recognition.onend = null;
            if (isRecording) {
                recognition.stop();
            }
        }
    };
  }, [isRecording]); // Only re-bind if isRecording changes, or on mount/unmount

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement === newCommentTextareaRef.current) {
        handleSaveOrUpdate();
      }
    }
  }, [onClose, handleSaveOrUpdate]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    } else {
      document.removeEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) {
    return null;
  }

  const isBulkModeNewComment = (editMode === 'mass' || editMode === 'group') && !item && bulkSelectionCount > 0;
  const modalTitle = editingCommentDetail 
    ? `Edit Annotation`
    : (isBulkModeNewComment 
        ? `Add ${editMode === 'group' ? 'Group' : 'Mass'} Comment to ${bulkSelectionCount} Sentences`
        : `Annotate Sentence`);
  
  const saveButtonText = editingCommentDetail ? 'Update Annotation' : 'Save Annotation';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-opacity duration-300 ease-in-out">
      <div className="bg-slate-800 p-6 md:p-8 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col transform transition-all duration-300 ease-in-out scale-95 opacity-0 animate-modal-appear">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-sky-400 flex items-center">
            {editingCommentDetail && <PencilSquareIcon className="w-6 h-6 mr-2 text-sky-400" />}
            {!editingCommentDetail && isBulkModeNewComment && editMode === 'group' && <UsersIcon className="w-6 h-6 mr-2 text-sky-400" />}
            {!editingCommentDetail && isBulkModeNewComment && editMode === 'mass' && <PencilIcon className="w-6 h-6 mr-2 text-sky-400" />}
            {!editingCommentDetail && !isBulkModeNewComment && item && <UserIcon className="w-6 h-6 mr-2 text-sky-400" />}
            {modalTitle}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-sky-400 transition-colors p-1 rounded-full -mr-2"
            aria-label="Close annotation modal"
          >
            <XMarkIcon className="w-7 h-7" />
          </button>
        </div>

        <div className="overflow-y-auto pr-2 space-y-6 flex-grow custom-scrollbar">
          {item && !isBulkModeNewComment && ( // Show sentence details only if an item is selected (single mode or editing existing)
            <>
              <div className="bg-slate-700 p-4 rounded-lg">
                <p className="text-sm text-slate-400 mb-1">Original Sentence (Chapter {item["Chapter Number"]}, Sentence {item["Sentence Number"]})</p>
                <p className="text-slate-100 leading-relaxed">{item.Sentence}</p>
              </div>

              {Object.keys(item.additionalAnalysis).length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {Object.entries(item.additionalAnalysis).map(([key, value]) => (
                    <div key={key} className="bg-slate-700 p-3 rounded-md">
                      <p className="text-slate-400 font-medium">{key}:</p>
                      <p className="text-slate-200 break-words">{value}</p>
                    </div>
                  ))}
                </div>
              )}
              
              {item.comments.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-sky-300 mb-3">Existing Annotations:</h3>
                  <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                    {item.comments.slice().sort((a,b) => b.timestamp - a.timestamp).map((comment) => (
                      <div key={comment.id} className={`bg-slate-700 p-3 rounded-md text-sm ${editingCommentDetail?.id === comment.id ? 'ring-2 ring-sky-500' : ''}`}>
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-slate-200 whitespace-pre-wrap break-words">{comment.text}</p>
                                <p className="text-xs text-slate-400 mt-1">
                                    {new Date(comment.timestamp).toLocaleString()}
                                    {comment.type === 'group' && <span className="ml-2 px-1.5 py-0.5 bg-purple-600 text-purple-100 rounded text-xs">Group Comment</span>}
                                    {comment.type === 'group' && comment.appliesToSentenceNumbers && 
                                      <span className="ml-2 text-purple-300 text-xs">Applies to S: {comment.appliesToSentenceNumbers.join(', ')}</span>}
                                </p>
                            </div>
                            <div className="flex space-x-1.5 ml-2 flex-shrink-0">
                                <button
                                    onClick={() => handleEditComment(comment)}
                                    className="p-1 text-slate-400 hover:text-sky-400 transition-colors"
                                    aria-label="Edit comment"
                                >
                                    <PencilSquareIcon className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleDelete(comment.id)}
                                    className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                                    aria-label="Delete comment"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
            
          <div>
            <label htmlFor="newComment" className="block text-sm font-medium text-sky-300 mb-2">
              {editingCommentDetail ? 'Edit Annotation Text' : (item && item.comments.length > 0 && !isBulkModeNewComment ? 'Add New Annotation' : (isBulkModeNewComment ? 'Enter Annotation Text' : 'Your Annotation'))} (Ctrl/Cmd + Enter to save)
            </label>
            <div className="relative">
              <textarea
                id="newComment"
                ref={newCommentTextareaRef}
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder={isBulkModeNewComment ? `Enter comment for ${bulkSelectionCount} sentences...` : (editingCommentDetail ? "Edit your comment..." : "Type or record your comment...")}
                rows={isBulkModeNewComment ? 4 : (item || editingCommentDetail ? 3 : 5)}
                className="w-full p-3 pr-12 bg-slate-700 border border-slate-600 rounded-md focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors text-slate-100 placeholder-slate-400 resize-y"
              />
              {SpeechRecognition && (
                <button
                  type="button"
                  onClick={handleToggleRecording}
                  disabled={isRecording && recognition?.readyState === 'capturing'} // readyState might not be standard, check browser compatibility
                  className={`absolute right-2 top-2 p-2 rounded-full transition-colors 
                              ${isRecording ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' : 'bg-sky-600 hover:bg-sky-500 text-white'}
                              disabled:bg-slate-500 disabled:cursor-not-allowed`}
                  aria-label={isRecording ? "Stop recording" : "Start recording comment"}
                >
                  <MicrophoneIcon className="w-5 h-5" isRecording={isRecording} />
                </button>
              )}
            </div>
            {speechError && <p className="text-xs text-red-400 mt-1">{speechError}</p>}
          </div>
        </div>

        <div className="mt-8 flex justify-end space-x-3 border-t border-slate-700 pt-6">
          <button
            onClick={onClose}
            type="button"
            className="px-6 py-2.5 rounded-md text-slate-300 bg-slate-600 hover:bg-slate-500 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveOrUpdate}
            type="button"
            disabled={newCommentText.trim() === '' || isRecording}
            className="px-6 py-2.5 rounded-md text-white bg-sky-600 hover:bg-sky-500 disabled:bg-sky-800 disabled:text-sky-500 disabled:cursor-not-allowed transition-colors font-medium flex items-center"
          >
            <CheckIcon className="w-5 h-5 mr-2" />
            {saveButtonText}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes modal-appear {
          0% { transform: scale(0.95); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-modal-appear { animation: modal-appear 0.3s ease-out forwards; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #64748b; }
      `}</style>
    </div>
  );
};

export default AnnotationModal;
