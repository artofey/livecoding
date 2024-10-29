import { useState } from 'react';
import CodeEditor from '../components/CodeEditor';
import { useWebRTCManager } from '../components/WebRTCManager';

interface CursorPosition {
  lineNumber: number;
  column: number;
}

export default function Home() {
  const [editorText, setEditorText] = useState<string>('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const { peers, sendData } = useWebRTCManager({
    clientId,
    isConnected,
    onDataReceived: (data) => setEditorText(data)
  });

  const startSession = () => {
    if (clientId) return;
    const newClientId = 'client' + Math.floor(Math.random() * 1000);
    setClientId(newClientId);
    setIsConnected(true);
  };

  const handleContentChange = (content: string) => {
    sendData(content);
  };

  const handleCursorChange = (position: CursorPosition) => {
    console.log(position);
  };

  const usersCursors: Record<string, CursorPosition> = {
    user1: { lineNumber: 1, column: 5 },
    user2: { lineNumber: 2, column: 10 },
  };

  return (
    <div>
      <h1>Live Coding Editor</h1>
      {!isConnected ? (
        <button onClick={startSession}>Start Session</button>
      ) : (
        <>
          <CodeEditor
            text={editorText}
            onChange={handleContentChange}
            onCursorChange={handleCursorChange}
            usersCursors={usersCursors}
          />
          {clientId && <p>Your client ID: {clientId}</p>}
          <p>Connected peers: {Object.keys(peers).join(', ')}</p>
        </>
      )}
    </div>
  );
}
