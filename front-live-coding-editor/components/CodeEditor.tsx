import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import * as monaco from 'monaco-editor';

interface CodeEditorProps {
    initialValue?: string;
    onChange: (content: string) => void;
    onCursorChange: (position: monaco.Position, reason: monaco.editor.CursorChangeReason) => void;
    usersCursors: Record<string, monaco.Position>;
}

// Импортируем Monaco Editor динамически только на клиентской стороне
const CodeEditor: React.FC<CodeEditorProps> = ({ initialValue, onChange, onCursorChange, usersCursors }) => {
    const editorRef = useRef<HTMLDivElement | null>(null);
    const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);
    const [decorationsCollection, setDecorationsCollection] = useState<monaco.editor.IEditorDecorationsCollection | null>(null);

    useEffect(() => {
        if (typeof window !== 'undefined' && editorRef.current) {
            // Это гарантирует, что редактор создается только на клиентской стороне
            const editorInstance = monaco.editor.create(editorRef.current, {
                value: initialValue || '',
                language: 'javascript',
            });

            setEditor(editorInstance);

            // Создаем коллекцию декораций
            const collection = editorInstance.createDecorationsCollection([]);
            setDecorationsCollection(collection);

            editorInstance.onDidChangeModelContent(() => {
                const content = editorInstance.getValue();
                onChange(content);
            });

            editorInstance.onDidChangeCursorPosition((event: monaco.editor.ICursorPositionChangedEvent) => {
                const position = event.position;
                const reason = event.reason;
                onCursorChange(position, reason);
            });

            return () => {
                editorInstance.dispose();
            };
        }
    }, [onChange, onCursorChange, initialValue]);

    useEffect(() => {
        if (editor && decorationsCollection) {
            const decorations = Object.entries(usersCursors).map(([userId, position]) => ({
                range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                options: {
                    className: `user-cursor-${userId}`,
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                },
            }));

            decorationsCollection.set(decorations);
        }
    }, [usersCursors, editor, decorationsCollection]);

    return <div ref={editorRef} style={{ height: '500px' }} />;
};

// Используем динамическую загрузку для отключения SSR
export default dynamic(() => Promise.resolve(CodeEditor), { ssr: false });
