import { useEffect, useRef, useState, useCallback } from 'react';

interface PeerConnection {
  peerConnection: RTCPeerConnection;
  dataChannel: RTCDataChannel | null;
}

interface WebRTCManagerProps {
  clientId: string | null;
  roomId: string | null;
  isConnected: boolean;
  onDataReceived: (data: string) => void;
}

export const useWebRTCManager = ({ clientId, roomId, isConnected, onDataReceived }: WebRTCManagerProps) => {
  const [peers, setPeers] = useState<{ [key: string]: PeerConnection }>({});
  const peersRef = useRef(peers);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  const createPeerConnection = useCallback((remoteClientId: string, isInitiator: boolean) => {
    if (peersRef.current[remoteClientId]?.peerConnection) {
      return peersRef.current[remoteClientId].peerConnection;
    }

    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${remoteClientId}:`, 
        peerConnection.iceConnectionState);
    };

    peerConnection.onconnectionstatechange = () => {
      console.log(`Connection state with ${remoteClientId}:`, 
        peerConnection.connectionState);
    };

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
      dataChannel = peerConnection.createDataChannel('textSync');
      setupDataChannel(dataChannel, remoteClientId);
    } else {
      peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        setupDataChannel(dataChannel, remoteClientId);
      };
    }

    setPeers(prev => ({
      ...prev,
      [remoteClientId]: { peerConnection, dataChannel }
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

  const setupDataChannel = (dataChannel: RTCDataChannel, remoteClientId: string) => {
    dataChannel.onopen = () => {
      console.log(`Data channel opened with ${remoteClientId}`);
    };
    
    dataChannel.onclose = () => {
      console.log(`Data channel closed with ${remoteClientId}`);
    };
    
    dataChannel.onerror = (error) => {
      console.error(`Data channel error with ${remoteClientId}:`, error);
    };
    
    dataChannel.onmessage = (event) => {
      console.log(`Data received from ${remoteClientId}:`, event.data);
      onDataReceived(event.data);
    };

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

  useEffect(() => {
    if (!isConnected || !roomId || !clientId) return;
    
    const address = process.env.NEXT_PUBLIC_WS_SERVER;
    if (!address) {
        console.error('WebSocket server address is not defined');
        return;
    }

    ws.current = new WebSocket(address);

    ws.current.onopen = () => {
        console.log('WebSocket connected');
        ws.current?.send(JSON.stringify({ 
            type: 'joinRoom', 
            clientId,
            roomId 
        }));
    };

    ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.current.onclose = () => {
        console.log('WebSocket closed');
    };

    ws.current.onmessage = async (event: MessageEvent) => {
        const jsonData = event.data instanceof Blob ? await event.data.text() : event.data;

        try {
            const data = JSON.parse(jsonData);
            console.log('WebSocket message received:', data);
            
            switch (data.type) {
                case 'clients':
                    console.log('Clients in room:', data.clients);
                    data.clients.forEach((remoteClientId: string) => {
                        if (remoteClientId !== clientId) {
                            createPeerConnection(remoteClientId, true);
                        }
                    });
                    break;
                case 'offer':
                    console.log('Received offer from:', data.senderId);
                    await handleOffer(data.offer, data.senderId);
                    break;
                case 'answer':
                    console.log('Received answer from:', data.senderId);
                    await handleAnswer(data.answer, data.senderId);
                    break;
                case 'candidate':
                    console.log('Received ICE candidate from:', data.senderId);
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
}, [isConnected, clientId, roomId, createPeerConnection]);

  const sendData = (content: string) => {
    Object.entries(peers).forEach(([peerId, peer]) => {
      if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
        try {
          peer.dataChannel.send(content);
          console.log(`Data sent to ${peerId}:`, content);
        } catch (error) {
          console.error(`Error sending data to ${peerId}:`, error);
        }
      } else {
        console.warn(`Cannot send to ${peerId}, channel state:`, 
          peer.dataChannel ? peer.dataChannel.readyState : 'null');
      }
    });
  };

  return {
    peers,
    sendData
  };
}; 