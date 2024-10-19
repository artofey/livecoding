import React, {  } from 'react';
import { Editor, OnMount } from '@monaco-editor/react';

interface CursorPosition {
  lineNumber: number;
  column: number;
}

interface CodeEditorProps {
  initialValue: string;
  onChange: (value: string) => void;
  onCursorChange: (position: CursorPosition) => void;
  usersCursors: Record<string, CursorPosition>;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ initialValue, onChange, onCursorChange, usersCursors }) => {
  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      onChange(value);
    }
  };

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editor.onDidChangeCursorPosition((event) => {
      const position = event.position;
      onCursorChange(position);
    });

    // Отображение курсоров других пользователей
    const decorations = Object.entries(usersCursors).map(([userId, position]) => ({
      range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
      options: {
        className: `user-cursor-${userId}`,
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    }));

    editor.createDecorationsCollection(decorations);
  };

  return (
    <Editor
      height="500px"
      defaultLanguage="javascript"
      defaultValue={initialValue}
      onChange={handleEditorChange}
      onMount={handleEditorDidMount}
    />
  );
};

export default CodeEditor;
