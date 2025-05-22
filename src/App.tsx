
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type { ImportedStoryFormat, ProcessedStoryData, AnalysisItem, RawAnalysisItem, CompleteStory, DisplayChapter, CommentObject, EditMode, ExportAnalysisItem, SimpleExportAnalysisItem } from './types';
import FileImporter from './components/FileImporter';
import StoryDisplay from './components/StoryDisplay';
import AnnotationModal from './components/AnnotationModal';
import { DownloadIcon, EditIcon, UsersIcon, UserIcon } from './components/icons';

const generateUniqueId = () => `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const App: React.FC = () => {
  const [storyData, setStoryData] = useState<ProcessedStoryData | null>(null);
  const [originalCompleteStory, setOriginalCompleteStory] = useState<CompleteStory | null>(null);
  
  const [selectedAnalysisItem, setSelectedAnalysisItem] = useState<AnalysisItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [editMode, setEditMode] = useState<EditMode>('single');
  const [bulkSelectedSentenceIds, setBulkSelectedSentenceIds] = useState<Set<string>>(new Set());

  const handleFileLoad = useCallback((data: ImportedStoryFormat) => {
    setIsLoading(true);
    setError(null);
    setEditMode('single');
    setBulkSelectedSentenceIds(new Set());
    setSelectedAnalysisItem(null);
    try {
      const newChaptersMap = new Map<number, AnalysisItem[]>();
      data.Analysis.forEach((rawItem: RawAnalysisItem) => {
        const {
            "Sentence": sentenceText,
            "Chapter Number": chapterNum,
            "Sentence Number": sentenceNum,
            comment: rawCommentText, // Legacy single comment
            "comment applies to sentences": rawAppliesTo, // Legacy group comment indicator
            all_comments, // New field for full comment history
            ...additionalProps 
        } = rawItem;

        if (typeof chapterNum !== 'number' || typeof sentenceNum !== 'number' || !sentenceText) {
            throw new Error(`Invalid Chapter/Sentence number or missing Sentence. Found: Ch ${chapterNum}, S ${sentenceNum}, Text: "${String(sentenceText).substring(0,20)}..."`);
        }
        
        let currentComments: CommentObject[] = [];
        if (all_comments && Array.isArray(all_comments)) {
            currentComments = all_comments.map(c => ({ // Ensure imported comments have all necessary fields
                id: c.id || generateUniqueId(),
                text: c.text,
                type: c.type,
                timestamp: c.timestamp || Date.now(),
                groupId: c.groupId,
                appliesToSentenceNumbers: c.appliesToSentenceNumbers,
            }));
        } else if (rawCommentText) { // Handle legacy format
            currentComments.push({
                id: generateUniqueId(),
                text: rawCommentText,
                type: rawAppliesTo ? 'group' : 'single',
                timestamp: Date.now(),
                appliesToSentenceNumbers: rawAppliesTo ? rawAppliesTo.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n)) : undefined,
                groupId: rawAppliesTo ? generateUniqueId() : undefined, // Generate a new groupId for legacy group comments
            });
        }
        
        const parsedAdditionalAnalysis: Record<string, string> = {};
        for (const key in additionalProps) {
            if (Object.prototype.hasOwnProperty.call(additionalProps, key)) {
                parsedAdditionalAnalysis[key] = String(additionalProps[key]);
            }
        }

        const item: AnalysisItem = {
          id: `ch${chapterNum}-s${sentenceNum}`,
          "Sentence": sentenceText,
          "Chapter Number": chapterNum,
          "Sentence Number": sentenceNum,
          additionalAnalysis: parsedAdditionalAnalysis,
          comments: currentComments,
        };

        if (!newChaptersMap.has(chapterNum)) {
          newChaptersMap.set(chapterNum, []);
        }
        newChaptersMap.get(chapterNum)!.push(item);
      });

      newChaptersMap.forEach(sentences => sentences.sort((a, b) => a["Sentence Number"] - b["Sentence Number"]));
      
      setStoryData({
        title: data["The Complete Story"].Title,
        chapters: newChaptersMap,
      });
      setOriginalCompleteStory(data["The Complete Story"]);
    } catch (e: any) {
      setError(`Error processing story data: ${e.message}`);
      setStoryData(null);
      setOriginalCompleteStory(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleProcessingError = useCallback((errorMessage: string) => {
    setError(errorMessage);
    setStoryData(null);
    setOriginalCompleteStory(null);
    setIsLoading(false);
  }, []);

  const handleSelectSentence = useCallback((item: AnalysisItem) => {
    if (editMode === 'single') {
      setSelectedAnalysisItem(item);
      setIsModalOpen(true);
    } else { 
      const newSelection = new Set(bulkSelectedSentenceIds);
      if (newSelection.has(item.id)) {
        newSelection.delete(item.id);
      } else {
        newSelection.add(item.id);
      }
      setBulkSelectedSentenceIds(newSelection);
      setSelectedAnalysisItem(null); 
    }
  }, [editMode, bulkSelectedSentenceIds]);

  const handleOpenModalForBulkAnnotate = () => {
    if (bulkSelectedSentenceIds.size > 0 && (editMode === 'mass' || editMode === 'group')) {
      setSelectedAnalysisItem(null); 
      setIsModalOpen(true);
    }
  };
  
  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    // selectedAnalysisItem is preserved for single edit mode, for bulk it's already null or irrelevant post-op
  }, []);

  const handleSaveOrUpdateComment = useCallback((commentText: string, editingCommentDetail: { id: string; groupId?: string } | null) => {
    if (!storyData || commentText.trim() === '') return;

    const newChaptersMap = new Map(storyData.chapters);
    const now = Date.now();

    if (editingCommentDetail) { // --------- EDIT EXISTING COMMENT ---------
      let itemThatContainedEditedComment: AnalysisItem | null = null;
      if (editingCommentDetail.groupId) { // Editing a group comment
        const groupIdToUpdate = editingCommentDetail.groupId;
        newChaptersMap.forEach((chapterSentences, chapterNum) => {
          const updatedChapterSentences = chapterSentences.map(s => {
            const commentIndex = s.comments.findIndex(c => c.groupId === groupIdToUpdate && c.id === editingCommentDetail.id); // Ensure it's the exact comment instance or the one that triggered edit
            if (commentIndex !== -1) {
               // Update ALL comments with this groupId
               const newCommentsForThisSentence = s.comments.map(c => {
                 if (c.groupId === groupIdToUpdate) {
                   return { ...c, text: commentText.trim(), timestamp: now };
                 }
                 return c;
               });
               if (s.id === selectedAnalysisItem?.id) itemThatContainedEditedComment = {...s, comments: newCommentsForThisSentence };
               return { ...s, comments: newCommentsForThisSentence };
            }
            // If the comment being edited (via its unique ID) is not in this sentence, but other comments from the same group are, update them too.
            // This logic is a bit complex if the `editingCommentDetail.id` is only for one instance of a group comment.
            // The most straightforward is: if a comment with `groupId` is edited, all comments with that `groupId` get the new text.
            else if (s.comments.some(c => c.groupId === groupIdToUpdate)) {
               const newCommentsForThisSentence = s.comments.map(c => {
                 if (c.groupId === groupIdToUpdate) {
                   return { ...c, text: commentText.trim(), timestamp: now };
                 }
                 return c;
               });
               if (s.id === selectedAnalysisItem?.id) itemThatContainedEditedComment = {...s, comments: newCommentsForThisSentence };
               return { ...s, comments: newCommentsForThisSentence };
            }
            return s;
          });
          newChaptersMap.set(chapterNum, updatedChapterSentences);
        });

      } else { // Editing a single comment
        for (const [chapterNum, sentences] of newChaptersMap.entries()) {
          const itemIndex = sentences.findIndex(s => s.comments.some(c => c.id === editingCommentDetail.id));
          if (itemIndex !== -1) {
            const updatedItem = { ...sentences[itemIndex] };
            updatedItem.comments = updatedItem.comments.map(c => 
              c.id === editingCommentDetail.id ? { ...c, text: commentText.trim(), timestamp: now } : c
            );
            const updatedSentences = [...sentences];
            updatedSentences[itemIndex] = updatedItem;
            newChaptersMap.set(chapterNum, updatedSentences);
            itemThatContainedEditedComment = updatedItem;
            break;
          }
        }
      }
      if (selectedAnalysisItem && itemThatContainedEditedComment && selectedAnalysisItem.id === itemThatContainedEditedComment.id) {
        setSelectedAnalysisItem(itemThatContainedEditedComment);
      }

    } else { // --------- ADD NEW COMMENT ---------
      if (editMode === 'single' && selectedAnalysisItem) {
        const chapterNum = selectedAnalysisItem["Chapter Number"];
        const sentences = newChaptersMap.get(chapterNum);
        if (sentences) {
          const itemIndex = sentences.findIndex(s => s.id === selectedAnalysisItem.id);
          if (itemIndex !== -1) {
            const updatedItem = { ...sentences[itemIndex] };
            updatedItem.comments = [
              ...updatedItem.comments,
              { id: generateUniqueId(), text: commentText.trim(), type: 'single', timestamp: now }
            ];
            const updatedSentences = [...sentences];
            updatedSentences[itemIndex] = updatedItem;
            newChaptersMap.set(chapterNum, updatedSentences);
            setSelectedAnalysisItem(updatedItem); 
          }
        }
      } else if ((editMode === 'mass' || editMode === 'group') && bulkSelectedSentenceIds.size > 0) {
        const commonGroupId = editMode === 'group' ? generateUniqueId() : undefined;
        const sentenceNumbersForGroup = editMode === 'group' 
          ? Array.from(bulkSelectedSentenceIds).map(id => {
              for (const sentences of newChaptersMap.values()) {
                const s = sentences.find(sent => sent.id === id);
                if (s) return s["Sentence Number"];
              }
              return -1; 
            }).filter(n => n !== -1).sort((a,b) => a-b)
          : undefined;

        bulkSelectedSentenceIds.forEach(itemId => {
          for (const [chapterNum, sentences] of newChaptersMap.entries()) {
            const itemIndex = sentences.findIndex(s => s.id === itemId);
            if (itemIndex !== -1) {
              const updatedItem = { ...sentences[itemIndex] };
              const newComment: CommentObject = {
                id: generateUniqueId(),
                text: commentText.trim(),
                type: editMode === 'group' ? 'group' : 'single',
                timestamp: now,
                ...(editMode === 'group' && { groupId: commonGroupId, appliesToSentenceNumbers: sentenceNumbersForGroup })
              };
              updatedItem.comments = [...updatedItem.comments, newComment];
              const updatedSentences = [...sentences];
              updatedSentences[itemIndex] = updatedItem;
              newChaptersMap.set(chapterNum, updatedSentences);
              break; 
            }
          }
        });
        setBulkSelectedSentenceIds(new Set()); 
      }
    }
    
    setStoryData(prev => prev ? { ...prev, chapters: newChaptersMap } : null);
    setIsModalOpen(false); 
  }, [storyData, editMode, selectedAnalysisItem, bulkSelectedSentenceIds]);
  
  const handleDeleteComment = useCallback((itemId: string, commentId: string) => {
    if (!storyData) return;
    const newChaptersMap = new Map(storyData.chapters);
    let itemToUpdateInModal: AnalysisItem | null = null;

    const commentToDeleteDetails = (() => {
        for (const sentences of newChaptersMap.values()) {
            for (const sentence of sentences) {
                if (sentence.id === itemId) {
                    return sentence.comments.find(c => c.id === commentId);
                }
            }
        }
        return null;
    })();


    if (commentToDeleteDetails && commentToDeleteDetails.type === 'group' && commentToDeleteDetails.groupId) {
        const groupIdToDelete = commentToDeleteDetails.groupId;
        newChaptersMap.forEach((chapSentences, cn) => {
            const updatedChapSentences = chapSentences.map(s => {
                const newComments = s.comments.filter(c => c.groupId !== groupIdToDelete);
                if (s.id === itemId && s.comments.length !== newComments.length) { // Check if this sentence was affected
                     itemToUpdateInModal = { ...s, comments: newComments };
                }
                return { ...s, comments: newComments };
            });
            newChaptersMap.set(cn, updatedChapSentences);
        });
    } else { // Single comment deletion or non-group comment
        for (const [chapterNum, sentences] of newChaptersMap.entries()) {
            const itemIndex = sentences.findIndex(s => s.id === itemId);
            if (itemIndex !== -1) {
                const currentItem = sentences[itemIndex];
                const updatedComments = currentItem.comments.filter(c => c.id !== commentId);
                const updatedItem = { ...currentItem, comments: updatedComments };
                const updatedSentences = [...sentences];
                updatedSentences[itemIndex] = updatedItem;
                newChaptersMap.set(chapterNum, updatedSentences);
                itemToUpdateInModal = updatedItem;
                break; 
            }
        }
    }
    
    setStoryData(prev => prev ? { ...prev, chapters: newChaptersMap } : null);

    if (selectedAnalysisItem && selectedAnalysisItem.id === itemId) {
        // Refresh selectedAnalysisItem from the potentially modified newChaptersMap
        const freshItem = Array.from(newChaptersMap.values()).flat().find(i => i.id === itemId);
        setSelectedAnalysisItem(freshItem || null);
    }

  }, [storyData, selectedAnalysisItem]);


  const commonExportLogic = (isSimpleExport: boolean) => {
    if (!storyData || !originalCompleteStory) {
      setError("No story data to export.");
      return;
    }

    const analysisExport: (ExportAnalysisItem | SimpleExportAnalysisItem)[] = [];
    storyData.chapters.forEach((sentencesInChapter) => {
      sentencesInChapter.forEach(item => {
        const latestComment = item.comments.length > 0 
          ? [...item.comments].sort((a, b) => b.timestamp - a.timestamp)[0]
          : null;

        let commentText: string | undefined = undefined;
        let commentAppliesTo: string | undefined = undefined;

        if (latestComment) {
          commentText = latestComment.text;
          if (latestComment.type === 'group' && latestComment.appliesToSentenceNumbers) {
            commentAppliesTo = latestComment.appliesToSentenceNumbers.join(',');
          }
        }
        
        if (isSimpleExport) {
            const simpleExportItem: SimpleExportAnalysisItem = {
                "Sentence": item.Sentence,
                "Sentence Number": item["Sentence Number"],
            };
            if (commentText) simpleExportItem.comment = commentText;
            if (commentAppliesTo) simpleExportItem["comment applies to sentences"] = commentAppliesTo;
            analysisExport.push(simpleExportItem);
        } else {
            const fullExportItem: ExportAnalysisItem = {
              "Sentence": item.Sentence,
              "Chapter Number": item["Chapter Number"],
              "Sentence Number": item["Sentence Number"],
              ...item.additionalAnalysis,
              all_comments: item.comments.map(c => ({ // Ensure clean export of comments
                  id: c.id,
                  text: c.text,
                  type: c.type,
                  timestamp: c.timestamp,
                  groupId: c.groupId,
                  appliesToSentenceNumbers: c.appliesToSentenceNumbers
              })), 
            };
            if (commentText) fullExportItem.comment = commentText;
            if (commentAppliesTo) fullExportItem["comment applies to sentences"] = commentAppliesTo;
            analysisExport.push(fullExportItem);
        }
      });
    });

    analysisExport.sort((a, b) => {
      const aCh = isSimpleExport ? 0 : (a as ExportAnalysisItem)["Chapter Number"]; // Simple export doesn't have chapter
      const bCh = isSimpleExport ? 0 : (b as ExportAnalysisItem)["Chapter Number"];
      if (aCh !== bCh && !isSimpleExport) {
        return aCh - bCh;
      }
      return a["Sentence Number"] - b["Sentence Number"];
    });
    
    const exportData = isSimpleExport 
        ? analysisExport 
        : {
            "Analysis": analysisExport,
            "The Complete Story": {
              "Title": storyData.title,
              "Chapters": originalCompleteStory.Chapters,
            }
          };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = storyData.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    a.download = `${safeTitle}_${isSimpleExport ? 'simple_' : ''}annotated_export.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFullExport = useCallback(() => commonExportLogic(false), [storyData, originalCompleteStory]);
  const handleSimpleExport = useCallback(() => commonExportLogic(true), [storyData, originalCompleteStory]);


  const displayChapters: DisplayChapter[] = useMemo(() => {
    if (!storyData) return [];
    return Array.from(storyData.chapters.entries())
      .map(([chapterNumber, sentences]) => ({ chapterNumber, sentences }))
      .sort((a, b) => a.chapterNumber - b.chapterNumber);
  }, [storyData]);
  
  useEffect(() => {
    if (editMode === 'single') {
      setBulkSelectedSentenceIds(new Set());
    }
  }, [editMode]);

  const EditModeButton: React.FC<{mode: EditMode, currentMode: EditMode, onClick: (mode: EditMode) => void, children: React.ReactNode, icon: React.ReactNode}> = 
    ({ mode, currentMode, onClick, children, icon }) => (
    <button
      onClick={() => onClick(mode)}
      aria-pressed={currentMode === mode}
      className={`flex-1 sm:flex-initial flex items-center justify-center px-4 py-2.5 rounded-md text-sm font-medium transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900
                  ${currentMode === mode 
                    ? 'bg-sky-600 text-white shadow-md hover:bg-sky-500 focus:ring-sky-500' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-sky-300 focus:ring-sky-600'}`}
    >
      {icon}
      <span className="ml-2">{children}</span>
    </button>
  );


  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 bg-slate-900">
      <header className="w-full max-w-5xl mb-8 text-center">
        <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-300 py-2">
          Story Annotator Pro
        </h1>
        <p className="text-slate-400 mt-2 text-lg">Import, review, and annotate your stories with ease.</p>
      </header>

      <main className="w-full max-w-5xl space-y-8">
        {error && (
          <div className="bg-red-800 border border-red-600 text-red-100 px-4 py-3 rounded-lg relative" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
            <button onClick={() => setError(null)} className="absolute top-0 bottom-0 right-0 px-4 py-3 text-red-200 hover:text-white" aria-label="Close error message">
              <span className="text-2xl">&times;</span>
            </button>
          </div>
        )}

        <FileImporter onFileLoad={handleFileLoad} onProcessingError={handleProcessingError} />
        
        {storyData && (
          <div className="sticky top-0 z-10 bg-slate-900/80 backdrop-blur-sm -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 rounded-b-lg shadow-lg mb-4"> {/* Sticky container */}
            <div className="p-4 bg-slate-800/70 rounded-lg shadow-inner space-y-4">
              <h2 className="text-xl font-semibold text-sky-300">Editing Mode</h2>
              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
                <EditModeButton mode="single" currentMode={editMode} onClick={setEditMode} icon={<UserIcon className="w-5 h-5"/>}>Single Sentence</EditModeButton>
                <EditModeButton mode="mass" currentMode={editMode} onClick={setEditMode} icon={<EditIcon className="w-5 h-5"/>}>Mass Annotate</EditModeButton>
                <EditModeButton mode="group" currentMode={editMode} onClick={setEditMode} icon={<UsersIcon className="w-5 h-5"/>}>Group Annotate</EditModeButton>
              </div>
              {(editMode === 'mass' || editMode === 'group') && (
                <div className="mt-3">
                  <p className="text-sm text-slate-400 mb-2">
                    {editMode === 'mass' ? 'Select multiple sentences to add the same comment to each individually.' : 'Select multiple sentences to link them with a single group comment.'}
                    Currently selected: {bulkSelectedSentenceIds.size} sentence(s).
                  </p>
                  {bulkSelectedSentenceIds.size > 0 && (
                    <button
                      onClick={handleOpenModalForBulkAnnotate}
                      className="w-full px-6 py-3 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-lg shadow-md transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-opacity-75 flex items-center justify-center"
                    >
                      <EditIcon className="w-5 h-5 mr-2" />
                      Annotate {bulkSelectedSentenceIds.size} Selected Sentence(s)
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}


        {isLoading && (
          <div className="text-center py-10 text-sky-400">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mx-auto"></div>
            <p className="mt-4 text-lg">Processing story...</p>
          </div>
        )}
        
        {!isLoading && storyData && (
          <div className="mt-6"> {/* Adjusted margin due to sticky header */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <button
                  onClick={handleFullExport}
                  className="w-full flex items-center justify-center px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg shadow-md transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-75"
                >
                  <DownloadIcon className="w-5 h-5 mr-2" />
                  Export Full Annotated Story
                </button>
                <button
                  onClick={handleSimpleExport}
                  className="w-full flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow-md transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75"
                >
                  <DownloadIcon className="w-5 h-5 mr-2" />
                  Export Simple Annotations
                </button>
            </div>
            <StoryDisplay
              title={storyData.title}
              chapters={displayChapters}
              onSelectSentence={handleSelectSentence}
              selectedAnalysisItemId={editMode === 'single' ? selectedAnalysisItem?.id : null}
              bulkSelectedSentenceIds={bulkSelectedSentenceIds}
              editMode={editMode}
            />
          </div>
        )}
        {!isLoading && !storyData && !error && (
             <div className="text-center py-16 text-slate-500">
                <p className="text-2xl">Welcome!</p>
                <p>Upload a story JSON file using the importer above to get started.</p>
            </div>
        )}
      </main>

      <AnnotationModal
        isOpen={isModalOpen}
        item={selectedAnalysisItem} 
        onSaveOrUpdateComment={handleSaveOrUpdateComment}
        onClose={handleCloseModal}
        onDeleteComment={handleDeleteComment}
        editMode={editMode}
        bulkSelectionCount={bulkSelectedSentenceIds.size}
      />
      
      <footer className="w-full max-w-5xl mt-12 pt-8 border-t border-slate-700 text-center">
        <p className="text-sm text-slate-500">Story Annotator Pro &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
};

export default App;
