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
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState('');

  const { peers, sendData } = useWebRTCManager({
    clientId,
    roomId,
    isConnected,
    onDataReceived: (data) => setEditorText(data)
  });

  const createRoom = () => {
    if (clientId) return;
    const newClientId = 'client' + Math.floor(Math.random() * 1000);
    const newRoomId = 'room' + Math.floor(Math.random() * 1000);
    setClientId(newClientId);
    setRoomId(newRoomId);
    setIsConnected(true);
  };

  const joinRoom = () => {
    if (clientId || !joinRoomId) return;
    const newClientId = 'client' + Math.floor(Math.random() * 1000);
    setClientId(newClientId);
    setRoomId(joinRoomId);
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
        <div>
          <button onClick={createRoom}>Create New Room</button>
          <div>
            <input
              type="text"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
              placeholder="Enter Room ID"
            />
            <button onClick={joinRoom}>Join Room</button>
          </div>
        </div>
      ) : (
        <>
          <CodeEditor
            text={editorText}
            onChange={handleContentChange}
            onCursorChange={handleCursorChange}
            usersCursors={usersCursors}
          />
          {clientId && <p>Your client ID: {clientId}</p>}
          {roomId && <p>Room ID: {roomId}</p>}
          <p>Connected peers: {Object.keys(peers).join(', ')}</p>
        </>
      )}
    </div>
  );
}
