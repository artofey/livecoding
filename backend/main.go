package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"

	"github.com/gorilla/websocket"
)

var (
	port     = getEnv("PORT", "3443")
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	clients   = make(map[string]*Client)
	clientsMu sync.Mutex
)

type Client struct {
	Id     string
	RoomId string
	Conn   *websocket.Conn
}

func NewClient(id string, roomId string, conn *websocket.Conn) *Client {
	return &Client{Id: id, RoomId: roomId, Conn: conn}
}

type MessageType string

const (
	TypeNewClient  MessageType = "newClient"
	TypeGetClients MessageType = "getClients"
	TypeClients    MessageType = "clients"
	TypeCreateRoom MessageType = "createRoom"
	TypeJoinRoom   MessageType = "joinRoom"
)

const (
	TypeOffer     MessageType = "offer"
	TypeAnswer    MessageType = "answer"
	TypeCandidate MessageType = "candidate"
)

type Message struct {
	Type      MessageType     `json:"type"`
	ClientId  string          `json:"clientId,omitempty"`
	SenderId  string          `json:"senderId,omitempty"`
	RoomId    string          `json:"roomId,omitempty"`
	Clients   []string        `json:"clients,omitempty"`
	Offer     json.RawMessage `json:"offer,omitempty"`
	Answer    json.RawMessage `json:"answer,omitempty"`
	Candidate json.RawMessage `json:"candidate,omitempty"`
}

func main() {
	http.HandleFunc("/", handleConnections)
	fmt.Printf("WebSocket server is running on port %s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func handleConnections(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	log.Println("New connection established", r.RemoteAddr)

	var senderID string

	for {
		var msg Message
		err := conn.ReadJSON(&msg)
		if err != nil {
			log.Printf("Error reading message: %v", err)
			handleClientDisconnection(conn)
			break
		}
		log.Printf("Message received: %+v", msg)

		if msg.Type == TypeCreateRoom || msg.Type == TypeJoinRoom {
			senderID = msg.ClientId
		}

		switch msg.Type {
		case TypeCreateRoom, TypeJoinRoom:
			handleRoomOperation(conn, msg.ClientId, msg.RoomId)
		case TypeGetClients:
			sendClientList(conn, msg.RoomId)
		case TypeOffer, TypeAnswer, TypeCandidate:
			forwardMessage(senderID, msg)
		default:
			log.Printf("Unknown message type: %s", msg.Type)
		}
	}
}

func handleRoomOperation(conn *websocket.Conn, clientId string, roomId string) {
	clientsMu.Lock()
	clients[clientId] = NewClient(clientId, roomId, conn)
	clientsMu.Unlock()

	log.Printf("Client %s joined room %s", clientId, roomId)
	broadcastClientsInRoom(roomId, []string{clientId})
}

func sendClientList(conn *websocket.Conn, roomId string) {
	clientsMu.Lock()
	clientList := make([]string, 0)
	for id, client := range clients {
		if client.RoomId == roomId {
			clientList = append(clientList, id)
		}
	}
	clientsMu.Unlock()

	msg := Message{Type: TypeClients, Clients: clientList}
	msgBytes, _ := json.Marshal(msg)
	conn.WriteMessage(websocket.TextMessage, msgBytes)
}

func forwardMessage(senderID string, msg Message) {
	clientsMu.Lock()
	targetClient, exists := clients[msg.ClientId]
	clientsMu.Unlock()

	msg.SenderId = senderID

	if exists && targetClient != nil {
		log.Printf("Forwarding %s from %s to %s", msg.Type, msg.SenderId, msg.ClientId)
		targetClient.Conn.WriteJSON(msg)
	} else {
		log.Printf("Unable to forward message to client %s", msg.ClientId)
	}
}

func handleClientDisconnection(conn *websocket.Conn) {
	clientsMu.Lock()
	clientId := getClientId(conn)
	client := clients[clientId]
	roomId := client.RoomId
	delete(clients, clientId)
	clientsMu.Unlock()

	log.Printf("Client disconnected: %s", clientId)
	broadcastClientsInRoom(roomId, nil)
}

func broadcastClientsInRoom(roomId string, excludeClients []string) {
	clientsMu.Lock()
	clientList := make([]string, 0)
	for id, client := range clients {
		if client.RoomId == roomId {
			clientList = append(clientList, id)
		}
	}
	clientsMu.Unlock()

	message := Message{Type: TypeClients, Clients: clientList}
	msgBytes, _ := json.Marshal(message)

	for _, client := range clients {
		if client == nil || contains(excludeClients, client.Id) || client.RoomId != roomId {
			continue
		}
		client.Conn.WriteMessage(websocket.TextMessage, msgBytes)
	}
}

func getClientId(conn *websocket.Conn) string {
	for id, client := range clients {
		if client.Conn == conn {
			return id
		}
	}
	return ""
}

func contains(arr []string, str string) bool {
	for _, v := range arr {
		if v == str {
			return true
		}
	}
	return false
}

func getEnv(key, fallback string) string {
	value, exists := os.LookupEnv(key)
	if !exists {
		return fallback
	}
	return value
}
