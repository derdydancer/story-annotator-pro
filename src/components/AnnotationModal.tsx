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


// Tool button config for programmable buttons
const TOOL_BUTTONS_KEY = 'story-annotator-pro-tool-buttons';
const defaultToolButtons = [
  { label: 'Shorten', value: 'Shorten this sentence and remove unnecessary fluff' },
  { label: 'Lengthen', value: 'Expand on this sentence and make it longer.' },
  { label: 'Cut', value: 'Remove this part of the sentence: ""' },
];

function getStoredToolButtons() {
  try {
    const raw = localStorage.getItem(TOOL_BUTTONS_KEY);
    if (!raw) return defaultToolButtons;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== 3) return defaultToolButtons;
    return parsed;
  } catch {
    return defaultToolButtons;
  }
}
function setStoredToolButtons(buttons: { label: string; value: string }[]) {
  localStorage.setItem(TOOL_BUTTONS_KEY, JSON.stringify(buttons));
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

  const [toolButtons, setToolButtons] = useState(getStoredToolButtons());
  const [showToolButtonSettings, setShowToolButtonSettings] = useState(false);
  const [toolButtonDrafts, setToolButtonDrafts] = useState(toolButtons);

  // Keep toolButtons in sync with localStorage
  useEffect(() => {
    setToolButtons(getStoredToolButtons());
  }, [showToolButtonSettings]);

  // Tool button handlers
  const handleToolButtonClick = (text: string) => {
    setNewCommentText(text);
    setTimeout(() => newCommentTextareaRef.current?.focus(), 50);
  };

  const isBulkModeNewComment = (editMode === 'mass' || editMode === 'group') && !item && bulkSelectionCount > 0;

  if (!isOpen) {
    return null;
  }

  // Only show tool buttons in single edit mode, not editing existing comment, not bulk
  const showToolButtons = editMode === 'single' && item && !editingCommentDetail && !isBulkModeNewComment;
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
          <div className="flex items-center gap-2">
            {showToolButtons && (
              <button
                onClick={() => setShowToolButtonSettings(true)}
                className="text-slate-400 hover:text-sky-400 p-1.5 rounded-full"
                title="Configure tool buttons"
                aria-label="Configure tool buttons"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 2.25c.414 0 .75.336.75.75v1.5a.75.75 0 01-1.5 0v-1.5c0-.414.336-.75.75-.75zm0 16.5c.414 0 .75.336.75.75v1.5a.75.75 0 01-1.5 0v-1.5c0-.414.336-.75.75-.75zm8.25-8.25c0 .414-.336.75-.75.75h-1.5a.75.75 0 010-1.5h1.5c.414 0 .75.336.75.75zm-16.5 0c0 .414.336.75.75.75h1.5a.75.75 0 010-1.5h-1.5a.75.75 0 00-.75.75zm13.364-5.114a.75.75 0 011.06 1.06l-1.06 1.06a.75.75 0 11-1.06-1.06l1.06-1.06zm-12.728 0a.75.75 0 011.06 0l1.06 1.06a.75.75 0 11-1.06 1.06l-1.06-1.06a.75.75 0 010-1.06zm12.728 12.728a.75.75 0 01-1.06 1.06l-1.06-1.06a.75.75 0 111.06-1.06l1.06 1.06zm-12.728 0a.75.75 0 010-1.06l1.06-1.06a.75.75 0 111.06 1.06l-1.06 1.06a.75.75 0 01-1.06 0z" /></svg>
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-sky-400 transition-colors p-1 rounded-full -mr-2"
              aria-label="Close annotation modal"
            >
              <XMarkIcon className="w-7 h-7" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto pr-2 space-y-6 flex-grow custom-scrollbar">
          {item && !isBulkModeNewComment && (
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
                      <p className="text-slate-200 break-words">{String(value)}</p>
                    </div>
                  ))}
                </div>
              )}
              
              {item.comments.length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-sky-300 mb-3">Existing Annotations:</h3>
                  <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                    {item.comments.slice().sort((a: CommentObject, b: CommentObject) => b.timestamp - a.timestamp).map((comment: CommentObject) => (
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
        {/* TOOL BUTTONS ROW - moved here, above textarea */}
          {showToolButtons && (
            <div className="flex flex-wrap gap-2 mb-2">
                <button
                type="button"
                className="px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 text-white text-xs font-semibold shadow"
                onClick={() => {
                  // Move cursor to where the sentence starts in the textarea after inserting
                  const sentence = item?.Sentence ?? '';
                  const text = `Change the sentence to: "${sentence}"`;
                  setNewCommentText(text);
                  setTimeout(() => {
                  if (newCommentTextareaRef.current) {
                    // Place cursor just after the colon and space
                    const pos = text.indexOf('"') + 1;
                    newCommentTextareaRef.current.focus();
                    newCommentTextareaRef.current.setSelectionRange(pos, pos);
                  }
                  }, 10);
                }}
                >
                Copy and Edit
                </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white text-xs font-semibold shadow"
                onClick={() => handleToolButtonClick('Remove this sentence altogether')}
              >
                Remove comment
              </button>
              {toolButtons.map((btn) => (
                <button
                  key={btn.label}
                  type="button"
                  className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-sky-200 text-xs font-semibold shadow border border-sky-700"
                  onClick={() => handleToolButtonClick(btn.value)}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          )}
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
      {/* TOOL BUTTON SETTINGS MODAL */}
      {showToolButtonSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-slate-800 p-6 rounded-lg shadow-xl max-w-md w-full text-center">
            <h3 className="text-lg text-sky-300 mb-4 font-semibold">Configure Tool Buttons</h3>
            <form
              onSubmit={e => {
                e.preventDefault();
                setStoredToolButtons(toolButtonDrafts);
                setToolButtons(toolButtonDrafts);
                setShowToolButtonSettings(false);
              }}
              className="space-y-4"
            >
              {toolButtonDrafts.map((btn, idx) => (
                <div key={idx} className="flex flex-col gap-1 mb-2">
                  <input
                    type="text"
                    className="px-3 py-2 rounded bg-slate-700 text-slate-100 border border-slate-600 focus:ring-2 focus:ring-sky-400"
                    value={btn.label}
                    onChange={e => {
                      const next = [...toolButtonDrafts];
                      next[idx] = { ...next[idx], label: e.target.value };
                      setToolButtonDrafts(next);
                    }}
                    placeholder={`Button ${idx + 1} label`}
                  />
                  <input
                    type="text"
                    className="px-3 py-2 rounded bg-slate-700 text-slate-100 border border-slate-600 focus:ring-2 focus:ring-sky-400"
                    value={btn.value}
                    onChange={e => {
                      const next = [...toolButtonDrafts];
                      next[idx] = { ...next[idx], value: e.target.value };
                      setToolButtonDrafts(next);
                    }}
                    placeholder={`Button ${idx + 1} value`}
                  />
                </div>
              ))}
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => { setToolButtonDrafts(toolButtons); setShowToolButtonSettings(false); }}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded font-semibold"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
