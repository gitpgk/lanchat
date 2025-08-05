import React, { useState, useEffect, useRef } from "react";
import { socket } from "./socket";
import "./style.css";

export default function App() {
  // --- All your existing state and refs remain the same ---
  const [username, setUsername] = useState(() => localStorage.getItem("chatUsername") || "");
  const [room, setRoom] = useState(() => localStorage.getItem("chatRoom") || "");
  const [inChat, setInChat] = useState(() => !!(localStorage.getItem("chatUsername") && localStorage.getItem("chatRoom")));
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [typingDisplay, setTypingDisplay] = useState("");
  const [activeChat, setActiveChat] = useState(() => localStorage.getItem("chatRoom") || "");
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // --- All your existing functions and useEffects remain the same ---
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    function onConnect() {
      console.log("Socket connected!");
      if (inChat && username && room) {
        socket.emit("joinRoom", { username, room });
      }
    }
    function onDisconnect() {
      console.log("Socket disconnected!");
    }
    function onLoadHistory({ messages: history }) {
      const formattedHistory = history.map(msg => ({
        user: msg.username,
        text: msg.text,
        timestamp: msg.timestamp,
        isPrivate: false,
      }));
      setMessages(formattedHistory);
    }
    function onMessage(data) {
      setMessages(prev => [...prev, data]);
    }
    function onRoomData({ users }) {
      setUsers(users);
    }
    function onUserTyping({ username: typingUsername, isTyping }) {
      if (isTyping) {
        setTypingDisplay(`${typingUsername} is typing...`);
      } else {
        setTypingDisplay("");
      }
    }
    function onHistoryCleared() {
      setMessages([]);
    }

    if (inChat) {
      socket.connect();
    }
    
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("loadHistory", onLoadHistory);
    socket.on("message", onMessage);
    socket.on("roomData", onRoomData);
    socket.on("userTyping", onUserTyping);
    socket.on("historyCleared", onHistoryCleared);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("loadHistory", onLoadHistory);
      socket.off("message", onMessage);
      socket.off("roomData", onRoomData);
      socket.off("userTyping", onUserTyping);
      socket.off("historyCleared", onHistoryCleared);
      socket.disconnect();
    };
  }, [inChat, username, room]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  function handleJoinChat() {
    if (!username || !room) return alert("Please fill all fields.");
    localStorage.setItem("chatUsername", username);
    localStorage.setItem("chatRoom", room);
    setInChat(true);
    setActiveChat(room);
  }

  function handleLogout() {
    socket.disconnect();
    localStorage.removeItem("chatUsername");
    localStorage.removeItem("chatRoom");
    setInChat(false);
    setUsername("");
    setRoom("");
    setMessages([]);
    setUsers([]);
    setActiveChat("");
  }

  function handleClearChat() {
    if (window.confirm("Are you sure you want to permanently delete this room's chat history for everyone?")) {
      socket.emit('clearHistory', { room });
    }
  }

  function handleSendMessage() {
    if (messageInput.trim() !== "") {
      const isPrivateChat = activeChat !== room;
      if (isPrivateChat) {
        socket.emit("privateMessage", { content: messageInput, to: activeChat });
      } else {
        socket.emit("chatMessage", messageInput);
      }
      setMessageInput("");
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      const recipient = isPrivateChat ? activeChat : null;
      socket.emit("typing", { room, isTyping: false, recipient });
    }
  }

  function handleTyping() {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    const isPrivateChat = activeChat !== room;
    const recipient = isPrivateChat ? activeChat : null;
    socket.emit("typing", { room, isTyping: true, recipient });
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing", { room, isTyping: false, recipient });
    }, 2000);
  }

  // --- NEW: Function to handle key presses in the input ---
  function handleKeyDown(event) {
    handleTyping(); // We still want the "is typing" indicator to work on any key press
    if (event.key === 'Enter') {
      event.preventDefault(); // Prevents a new line from being added
      handleSendMessage();
    }
  }

  const displayedMessages = messages.filter(msg => {
    if (activeChat === room) {
      return !msg.isPrivate;
    } else {
      return msg.isPrivate && ((msg.from === username && msg.to === activeChat) || (msg.from === activeChat && msg.to === username));
    }
  });

  if (!inChat) {
    return (
      <div className="login-container">
        <h2>Join Chat Room</h2>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter username" />
        <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Enter room name" />
        <button onClick={handleJoinChat}>Join</button>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="sidebar">
        <div>
          <div className={`sidebar-item ${activeChat === room ? 'active' : ''}`} onClick={() => setActiveChat(room)}>
            <h3>Room: {room}</h3>
          </div>
          <h4>Online Users ({users.filter(u => u !== username).length})</h4>
          <ul className="user-list">
            {users.filter(u => u !== username).map((user) => (
              <li key={user} className={`sidebar-item ${activeChat === user ? 'active' : ''}`} onClick={() => setActiveChat(user)}>
                <span className="online-indicator"></span>
                {user}
              </li>
            ))}
          </ul>
        </div>
        <div className="sidebar-footer">
          <div className="current-user-display">
            Logged in as: <strong>{username}</strong>
          </div>
          <button onClick={handleClearChat} className="clear-chat-button">Clear Chat</button>
          <button onClick={handleLogout} className="logout-button">Logout</button>
        </div>
      </div>
      <div className="chat-window">
        <div className="chat-header">
          <h3>{activeChat}</h3>
        </div>
        <div className="messages">
          {displayedMessages.map((msg, index) => (
            <div key={index} className={`message ${(msg.user || msg.from) === username ? "my-message" : "other-message"}`}>
              <div className="message-content">
                <strong>{`${msg.user || msg.from}: `}</strong>
                {`${msg.text}`}
              </div>
              <div className="message-timestamp">
                {msg.timestamp && new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="typing-indicator">{typingDisplay}</div>
        
        {/* --- UPDATE: The input now uses the new handleKeyDown function --- */}
        <div className="message-input-area">
          <input 
            value={messageInput} 
            onChange={(e) => setMessageInput(e.target.value)} 
            onKeyDown={handleKeyDown} 
            placeholder={`Message ${activeChat}`} 
          />
          <button onClick={handleSendMessage}>Send</button>
        </div>
      </div>
    </div>
  );
}