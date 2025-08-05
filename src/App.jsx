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

  // Refs for auto-scroll and typing timeout
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Auto-scroll function
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Main effect for socket event listeners
  useEffect(() => {
    socket.connect();

    function onMessage(data) {
      setMessages((prevMessages) => [...prevMessages, data]);
    }

    function onRoomData({ users }) {
      setUsers(users);
    }

    function onUserTyping({ username, isTyping }) {
      if (isTyping) {
        setTypingDisplay(`${username} is typing...`);
      } else {
        setTypingDisplay("");
      }
    }

    // Register listeners
    socket.on("message", onMessage);
    socket.on("roomData", onRoomData);
    socket.on("userTyping", onUserTyping);

    // Cleanup listeners on component unmount
    return () => {
      socket.off("message", onMessage);
      socket.off("roomData", onRoomData);
      socket.off("userTyping", onUserTyping);
      socket.disconnect();
    };
  }, []);

  // Effect for auto-scrolling
  useEffect(() => {
    scrollToBottom();
  }, [messages]); // Runs every time the messages array changes

  // Handler functions
  function handleJoinChat() {
    if (!username || !room) return alert("Please fill all fields.");
    socket.emit("joinRoom", { username, room });
    setInChat(true);
  }

  function handleSendMessage() {
    if (messageInput.trim() !== "") {
      socket.emit("chatMessage", messageInput);
      setMessageInput("");
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      socket.emit("typing", { room, isTyping: false });
    }
  }

  function handleTyping() {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    socket.emit("typing", { room, isTyping: true });

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing", { room, isTyping: false });
    }, 2000); // 2 seconds
  }

  // Conditional Rendering: Login screen or Chat screen
  if (!inChat) {
    return (
      <div className="login-container">
        <h2>Join Chat Room</h2>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter username"
        />
        <input
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder="Enter room name"
        />
        <button onClick={handleJoinChat}>Join</button>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="sidebar">
        <h3>Room: {room}</h3>
        <h4>Online Users ({users.length})</h4>
        <ul className="user-list">
          {users.map((user, index) => (
            <li key={index}>
              <span className="online-indicator"></span>
              {user}
            </li>
          ))}
        </ul>
      </div>

      <div className="chat-window">
        <div className="messages">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`message ${
                msg.user === username ? "my-message" : "other-message"
              }`}
            >
              <div className="message-content">
                <strong>{`${msg.user}: `}</strong>
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
            onChange={(e) => {
              setMessageInput(e.target.value);
              handleTyping();
            }}
            placeholder="Type a message"
          />
          <button onClick={handleSendMessage}>Send</button>
        </div>
      </div>
    </div>
  );
}