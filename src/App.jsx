// src/App.jsx (CORRECTED)
import React, { useState, useEffect, useRef } from "react";
import { socket } from "./socket";
import "./style.css";

export default function App() {
  // State management
  const [inChat, setInChat] = useState(false);
  const [username, setUsername] = useState("");
  const [room, setRoom] = useState("");
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [typingDisplay, setTypingDisplay] = useState("");
  const [activeChat, setActiveChat] = useState("");

  // Refs
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Main effect for socket event listeners
  useEffect(() => {
    socket.connect();

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

    // *** CHANGE 1: The listener now just sets the raw user data ***
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

    socket.on("loadHistory", onLoadHistory);
    socket.on("message", onMessage);
    socket.on("roomData", onRoomData);
    socket.on("userTyping", onUserTyping);

    return () => {
      socket.off("loadHistory", onLoadHistory);
      socket.off("message", onMessage);
      socket.off("roomData", onRoomData);
      socket.off("userTyping", onUserTyping);
      socket.disconnect();
    };
  }, []); // *** CHANGE 2: Dependency array is now empty to run only once ***

  // Effect for auto-scrolling
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handler functions
  function handleJoinChat() {
    if (!username || !room) return alert("Please fill all fields.");
    socket.emit("joinRoom", { username, room });
    setInChat(true);
    setActiveChat(room);
  }

  function handleSendMessage() {
    if (messageInput.trim() !== "") {
      if (activeChat === room) {
        socket.emit("chatMessage", messageInput);
      } else {
        socket.emit("privateMessage", { content: messageInput, to: activeChat });
      }
      setMessageInput("");
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      const recipient = activeChat !== room ? activeChat : null;
      socket.emit("typing", { room, isTyping: false, recipient });
    }
  }

  function handleTyping() {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    const recipient = activeChat !== room ? activeChat : null;
    socket.emit("typing", { room, isTyping: true, recipient });

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing", { room, isTyping: false, recipient });
    }, 2000);
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
        <div 
          className={`sidebar-item ${activeChat === room ? 'active' : ''}`}
          onClick={() => setActiveChat(room)}
        >
          <h3>Room: {room}</h3>
        </div>
        {/* The user list is now filtered here during render, using the current username */}
        <h4>Online Users ({users.filter(u => u !== username).length})</h4>
        <ul className="user-list">
          {users.filter(u => u !== username).map((user) => (
            <li 
              key={user} 
              className={`sidebar-item ${activeChat === user ? 'active' : ''}`}
              onClick={() => setActiveChat(user)}
            >
              <span className="online-indicator"></span>
              {user}
            </li>
          ))}
        </ul>
      </div>

      <div className="chat-window">
        <div className="chat-header">
            <h3>{activeChat}</h3>
        </div>
        <div className="messages">
          {displayedMessages.map((msg, index) => (
            <div
              key={index}
              className={`message ${
                (msg.user || msg.from) === username ? "my-message" : "other-message"
              }`}
            >
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

        <div className="message-input-area">
          <input
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={handleTyping}
            placeholder={`Message ${activeChat}`}
          />
          <button onClick={handleSendMessage}>Send</button>
        </div>
      </div>
    </div>
  );
}