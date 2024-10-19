import { useEffect, useRef, useState, useCallback } from 'react';

interface PeerConnection {
  peerConnection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
}


export default function Home() {
  const [peers, setPeers] = useState<{ [key: string]: PeerConnection }>({});
  const [editorText, setEditorText] = useState<string>('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const peersRef = useRef(peers);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  const createPeerConnection = useCallback((remoteClientId: string, isInitiator: boolean) => {
    // Убедимся, что peerConnection создается только один раз для каждого remoteClientId
    if (peersRef.current[remoteClientId]?.peerConnection) {
      console.log(`Peer connection already exists for ${remoteClientId}`);
      return peersRef.current[remoteClientId].peerConnection;
    }

    console.log(`Creating new peer connection for ${remoteClientId}`);
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        ws.current?.send(JSON.stringify({
          type: 'candidate',
          candidate: event.candidate,
          clientId: remoteClientId
        }));
      }
    };

    let dataChannel: RTCDataChannel | null = null;

    if (isInitiator) {
      console.log('Creating data channel for', remoteClientId);
      dataChannel = peerConnection.createDataChannel('textSync');
      setupDataChannel(dataChannel, remoteClientId);
    } else {
      console.log('Waiting for data channel from', remoteClientId);
      peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel
        setupDataChannel(dataChannel, remoteClientId);
      };
    }

    setPeers(prev => ({
      ...prev,
      [remoteClientId]: { peerConnection, dataChannel: dataChannel } // Сохраняем только один peerConnection
    }));

    if (isInitiator) {
      peerConnection.createOffer()
        .then(offer => peerConnection.setLocalDescription(offer))
        .then(() => {
          ws.current?.send(JSON.stringify({
            type: 'offer',
            offer: peerConnection.localDescription,
            clientId: remoteClientId
          }));
        });
    }

    return peerConnection;
  }, []);

  useEffect(() => {
    if (!isConnected) return;

    ws.current = new WebSocket('ws://192.168.0.235:8080');

    ws.current.onopen = () => {
      console.log('WebSocket connection established');
      if (clientId) {
        ws.current?.send(JSON.stringify({ type: 'newClient', clientId }));
      }
    };

    ws.current.onmessage = async (event: MessageEvent) => {
      let jsonData: string;
      if (event.data instanceof Blob) {
        jsonData = await event.data.text();
      } else {
        jsonData = event.data;
      }
      
      try {
        const data = JSON.parse(jsonData);
        console.log('WebSocket message received:', data);

        switch (data.type) {
          case 'clients':
            data.clients.forEach((remoteClientId: string) => {
              // Создаем peerConnection только если это не наш клиент
              if (remoteClientId !== clientId) {
                createPeerConnection(remoteClientId, true);
              }
            });
            break;
          case 'offer':
            await handleOffer(data.offer, data.senderId);
            break;
          case 'answer':
            await handleAnswer(data.answer, data.senderId);
            break;
          case 'candidate':
            await handleCandidate(data.candidate, data.senderId);
            break;
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };

    return () => {
      ws.current?.close();
    };
  }, [isConnected, clientId, createPeerConnection]);

  const startSession = () => {
    if (clientId) return;
    const newClientId = 'client' + Math.floor(Math.random() * 1000);
    setClientId(newClientId);
    setIsConnected(true);
  };

  const setupDataChannel = (dataChannel: RTCDataChannel, remoteClientId: string) => {
    dataChannel.onopen = () => console.log(`Data channel opened with ${remoteClientId}`);
    dataChannel.onmessage = (event) => {
      console.log('Data channel message received:', event.data);
      setEditorText(event.data);
    }

    setPeers(prev => ({
      ...prev,
      [remoteClientId]: { ...prev[remoteClientId], dataChannel }
    }));
  };

  const handleOffer = async (offer: RTCSessionDescriptionInit, remoteClientId: string) => {
    const peerConnection = createPeerConnection(remoteClientId, false);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    ws.current?.send(JSON.stringify({
      type: 'answer',
      answer: peerConnection.localDescription,
      clientId: remoteClientId
    }));
  };

  const handleAnswer = async (answer: RTCSessionDescriptionInit, remoteClientId: string) => {
    const peerConnection = peersRef.current[remoteClientId]?.peerConnection;
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  };

  const handleCandidate = async (candidate: RTCIceCandidateInit, remoteClientId: string) => {
    const peerConnection = peersRef.current[remoteClientId]?.peerConnection;
    if (peerConnection) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  };

  const handleLocalTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setEditorText(newText);
    Object.values(peers).forEach(peer => {
      if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
        peer.dataChannel.send(newText);
      }
    });
  };

  return (
    <div>
      <h1>Live Coding Editor</h1>
      {!isConnected ? (
        <button onClick={startSession}>Start Session</button>
      ) : (
        <>
          <textarea
            value={editorText}
            onChange={handleLocalTextChange}
            rows={10}
            cols={50}
            placeholder="Type something..."
          />
          {clientId && <p>Your client ID: {clientId}</p>}
          <p>Connected peers: {Object.keys(peers).join(', ')}</p>
        </>
      )}
    </div>
  );
}
