

export interface CommentObject {
  id: string; // Unique ID for the comment itself
  text: string;
  type: 'single' | 'group';
  timestamp: number; // For sorting, identifying 'latest'
  groupId?: string; // Shared ID for all comments belonging to the same group action
  appliesToSentenceNumbers?: number[]; // Store sentence numbers for group comment export
}

// What we expect to READ from the JSON file's "Analysis" array
export interface RawAnalysisItem {
  "Sentence": string;
  "Chapter Number": number;
  "Sentence Number": number;
  comment?: string; // Support for old format or simple re-import
  "comment applies to sentences"?: string; // Support for re-importing group comments
  all_comments?: CommentObject[]; // For re-importing full comment history
  // Catch-all for other properties like "Plot Function", "Grimm Style"
  [key: string]: any;
}

// Our internal representation of a sentence with its annotations
export interface AnalysisItem {
  id: string; // e.g., "ch1-s2"
  "Sentence": string;
  "Chapter Number": number;
  "Sentence Number": number;
  additionalAnalysis: Record<string, string>; // Stores "Plot Function" etc.
  comments: CommentObject[];
}

// For export, what items in "Analysis" array will look like (main export)
export interface ExportAnalysisItem extends RawAnalysisItem {
    all_comments: CommentObject[]; // Ensures all_comments is part of the main export structure
}

// For simple export
export interface SimpleExportAnalysisItem {
    "Sentence": string;
    "Sentence Number": number;
    comment?: string;
    "comment applies to sentences"?: string;
}


export interface CompleteStory {
  "Title": string;
  "Chapters": string[]; // Array of chapter texts/strings. We'll preserve this for export.
}

export interface ImportedStoryFormat {
  "Analysis": RawAnalysisItem[];
  "The Complete Story": CompleteStory;
}

export interface ProcessedStoryData {
  title: string;
  // Chapters map: Key is Chapter Number, Value is an array of AnalysisItems for that chapter
  chapters: Map<number, AnalysisItem[]>;
}

export interface DisplayChapter {
  chapterNumber: number;
  sentences: AnalysisItem[];
}

export type EditMode = 'single' | 'mass' | 'group';