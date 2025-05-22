
import React from 'react';
import type { AnalysisItem, DisplayChapter, CommentObject, EditMode } from '../types'; // Added EditMode
import { EditIcon, CommentIcon, CheckCircleIcon } from './icons'; // Added CheckCircleIcon for bulk selection

interface StoryDisplayProps {
  title: string | null;
  chapters: DisplayChapter[];
  onSelectSentence: (item: AnalysisItem) => void;
  selectedAnalysisItemId?: string | null; // For single edit mode focus
  bulkSelectedSentenceIds: Set<string>; // For mass/group edit mode
  editMode: EditMode;
}

const StoryDisplay: React.FC<StoryDisplayProps> = ({ title, chapters, onSelectSentence, selectedAnalysisItemId, bulkSelectedSentenceIds, editMode }) => {
  if (!title || chapters.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400">
        <p className="text-lg">No story loaded yet.</p>
        <p>Please import a story JSON file to begin annotating.</p>
      </div>
    );
  }

  const getCommentSummary = (comments: CommentObject[]): string => {
    if (comments.length === 0) return "";
    const latestComment = comments.sort((a,b) => b.timestamp - a.timestamp)[0];
    let summary = `Annotation (${comments.length}): "${latestComment.text.substring(0,40)}`;
    if (latestComment.text.length > 40) summary += "...";
    summary += `"`;
    if (latestComment.type === 'group') summary += " (Group)";
    return summary;
  };

  return (
    <div className="space-y-8 p-4 md:p-6">
      <h1 className="text-4xl font-bold text-sky-400 tracking-tight text-center break-words">{title}</h1>
      
      {chapters.map(({ chapterNumber, sentences }) => (
        <div key={`chapter-${chapterNumber}`} className="bg-slate-800 p-6 rounded-lg shadow-xl">
          <h2 className="text-2xl font-semibold text-sky-300 mb-6 border-b border-slate-700 pb-3">
            Chapter {chapterNumber}
          </h2>
          <div className="space-y-4">
            {sentences.map((item) => {
              const isSingleSelected = editMode === 'single' && selectedAnalysisItemId === item.id;
              const isBulkSelected = (editMode === 'mass' || editMode === 'group') && bulkSelectedSentenceIds.has(item.id);
              
              let baseClasses = "p-4 rounded-md cursor-pointer transition-all duration-150 ease-in-out flex justify-between items-start group relative";
              let selectionClasses = "";

              if (isSingleSelected) {
                selectionClasses = 'bg-sky-700 ring-2 ring-sky-400 shadow-lg';
              } else if (isBulkSelected) {
                selectionClasses = 'bg-teal-800 ring-2 ring-teal-500 shadow-md';
              } else {
                selectionClasses = 'bg-slate-700 hover:bg-slate-600';
              }

              return (
                <div
                  key={item.id}
                  onClick={() => onSelectSentence(item)}
                  className={`${baseClasses} ${selectionClasses}`}
                  aria-selected={isSingleSelected || isBulkSelected}
                >
                  {isBulkSelected && (
                    <div className="absolute -top-2 -left-2 p-0.5 bg-teal-500 rounded-full text-white">
                      <CheckCircleIcon className="w-5 h-5" />
                    </div>
                  )}
                  <div>
                    <p className={`text-slate-100 leading-relaxed ${isSingleSelected ? 'font-medium': ''}`}>
                      <span className="text-xs text-sky-400 mr-2 font-mono select-none">S{item["Sentence Number"]}:</span>
                      {item.Sentence}
                    </p>
                    {item.comments.length > 0 && (
                     <p className="mt-2 text-xs text-amber-400 italic flex items-center">
                       <CommentIcon className="w-3 h-3 mr-1.5 flex-shrink-0" /> 
                       {getCommentSummary(item.comments)}
                     </p>
                    )}
                  </div>
                  <button 
                    aria-label={editMode === 'single' ? "Edit annotation" : "Select sentence for bulk annotation"}
                    className={`ml-4 p-1.5 rounded ${isSingleSelected ? 'text-sky-200' : 'text-slate-400 group-hover:text-sky-400 opacity-50 group-hover:opacity-100'} transition-opacity`}
                  >
                    <EditIcon className="w-5 h-5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default StoryDisplay;
