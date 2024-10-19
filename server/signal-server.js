const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const clients = new Map(); // Изменено с Set на Map для хранения WebSocket объектов

wss.on('connection', function connection(ws) {
  console.log('New connection established');

  ws.on('message', function incoming(message) {
    let data;
    try {
      data = JSON.parse(message);
    } catch (error) {
      console.error('Error parsing message:', error);
      return;
    }
    console.log('Message received:', data);

    switch (data.type) {
      case 'newClient':
        handleNewClient(ws, data.clientId);
        break;
      case 'getClients':
        sendClientList(ws);
        break;
      case 'offer':
      case 'answer':
      case 'candidate':
        forwardMessage(ws, data);
        break;
      default:
        console.warn('Unknown message type:', data.type);
    }
  });

  ws.on('close', () => {
    handleClientDisconnection(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function handleNewClient(ws, clientId) {
  console.log(`New client registered: ${clientId}`);
  clients.set(clientId, ws);
  ws.clientId = clientId;
  broadcastClients([clientId]);
}

function sendClientList(ws) {
  const clientList = Array.from(clients.keys());
  ws.send(JSON.stringify({ type: 'clients', clients: clientList }));
}

function forwardMessage(sender, data) {
  const targetClient = clients.get(data.clientId);
  data.senderId = sender.clientId;
  if (targetClient && targetClient.readyState === WebSocket.OPEN) {
    console.log(`Forwarding ${data.type} from ${sender.clientId} to ${data.clientId}`);
    targetClient.send(JSON.stringify(data));
  } else {
    console.warn(`Unable to forward message to client ${data.clientId}`);
  }
}

function handleClientDisconnection(ws) {
  if (ws.clientId) {
    console.log(`Client disconnected: ${ws.clientId}`);
    clients.delete(ws.clientId);
    broadcastClients();
  }
}

function broadcastClients(excludeClients = []) {
  const clientList = Array.from(clients.keys());
  const message = JSON.stringify({ type: 'clients', clients: clientList });
  console.log('Broadcasting client list:', clientList);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && !excludeClients.includes(client.clientId)) {
      client.send(message);
    }
  });
}

console.log('WebSocket server is running on port 8080');
