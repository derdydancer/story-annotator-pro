import React from 'react';

const HelpPage: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
    <div className="bg-slate-800 p-8 rounded-lg shadow-xl max-w-lg w-full relative">
      <button
        onClick={onClose}
        className="absolute top-3 right-3 text-slate-300 hover:text-white text-2xl font-bold focus:outline-none"
        aria-label="Close help"
      >
        &times;
      </button>
      <h2 className="text-2xl font-bold text-sky-300 mb-4">Help &amp; Instructions</h2>
      <ul className="list-disc pl-6 text-slate-200 space-y-2 mb-4">
        <li>Import a story JSON file using the Importer or paste JSON from your clipboard.</li>
        <li>Switch between <b>Single</b>, <b>Mass</b>, and <b>Group</b> annotation modes to annotate sentences.</li>
        <li>Click a sentence to add or edit comments. In Mass/Group mode, select multiple sentences and annotate them together.</li>
        <li>Export your annotations as a full or simple JSON file, or copy them to your clipboard.</li>
        <li>Save your work to your browser's local storage and load it later.</li>
        <li>Deleting a group comment removes it from all linked sentences.</li>
      </ul>
      <p className="text-slate-400 text-sm">For more details, see the README or contact the developer.</p>
    </div>
  </div>
);

export default HelpPage;
