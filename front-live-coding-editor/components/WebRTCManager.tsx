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
      
      if (peerConnection.iceConnectionState === 'disconnected' || 
          peerConnection.iceConnectionState === 'failed' || 
          peerConnection.iceConnectionState === 'closed') {
        cleanupPeerConnection(remoteClientId);
      }
    };

    peerConnection.onconnectionstatechange = () => {
      console.log(`Connection state with ${remoteClientId}:`, 
        peerConnection.connectionState);
      
      if (peerConnection.connectionState === 'failed' || 
          peerConnection.connectionState === 'closed') {
        cleanupPeerConnection(remoteClientId);
      }
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

  const cleanupPeerConnection = (peerId: string) => {
    const peer = peersRef.current[peerId];
    if (peer) {
      // Закрываем data channel
      if (peer.dataChannel) {
        peer.dataChannel.close();
      }
      
      // Закрываем peer connection
      if (peer.peerConnection) {
        peer.peerConnection.close();
      }
      
      // Удаляем пир из состояния
      setPeers(prev => {
        const newPeers = { ...prev };
        delete newPeers[peerId];
        return newPeers;
      });
      
      console.log(`Cleaned up peer connection with ${peerId}`);
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
                    // Находим отключившихся клиентов
                    const currentPeerIds = Object.keys(peersRef.current);
                    const disconnectedPeers = currentPeerIds.filter(
                        peerId => !data.clients.includes(peerId) && peerId !== clientId
                    );
                    
                    // Очищаем отключившихся клиентов
                    disconnectedPeers.forEach(peerId => {
                        cleanupPeerConnection(peerId);
                    });
                    
                    // Создаем соединения с новыми клиентами
                    data.clients.forEach((remoteClientId: string) => {
                        if (remoteClientId !== clientId && !peersRef.current[remoteClientId]) {
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
        // Очищаем все соединения при размонтировании
        Object.keys(peersRef.current).forEach(peerId => {
            cleanupPeerConnection(peerId);
        });
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
          // Если возникла ошибка при отправке, очищаем соединение
          cleanupPeerConnection(peerId);
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