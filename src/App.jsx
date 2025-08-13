import React, { useState, useEffect, useRef } from "react";
import { socket } from "./socket";
import "./style.css";
import ParticleBackground from "./ParticleBackground";
import { IoSend, IoAttach } from "react-icons/io5";

// --- Helper functions for Avatars ---
const getInitials = (name) => {
  if (!name) return '';
  const words = name.split(' ');
  if (words.length > 1) {
    return words[0][0] + words[1][0];
  }
  return name.substring(0, 2);
};
const avatarColors = ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff'];
const getColorFromName = (name) => {
    if (!name) return '#ccc';
    const charCodeSum = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return avatarColors[charCodeSum % avatarColors.length];
};

export default function App() {
  // --- Existing state ---
  const [username, setUsername] = useState(() => localStorage.getItem("chatUsername") || "");
  const [room, setRoom] = useState(() => localStorage.getItem("chatRoom") || "");
  const [inChat, setInChat] = useState(() => !!(localStorage.getItem("chatUsername") && localStorage.getItem("chatRoom")));
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [typingDisplay, setTypingDisplay] = useState("");
  const [activeChat, setActiveChat] = useState(() => localStorage.getItem("chatRoom") || "");
  
  // --- NEW: State for mention suggestions ---
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // --- Existing refs ---
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // --- Existing functions and useEffects ---
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
      setShowSuggestions(false); // Hide suggestions after sending
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      const recipient = isPrivateChat ? activeChat : null;
      socket.emit("typing", { room, isTyping: false, recipient });
    }
  }
  
  // --- NEW: Function to handle input changes for mentions ---
  const handleInputChange = (e) => {
    const value = e.target.value;
    setMessageInput(value);

    // Check if we are in the main room chat
    if (activeChat === room) {
        const lastWord = value.split(" ").pop();
        if (lastWord.startsWith("@")) {
          const searchTerm = lastWord.substring(1).toLowerCase();
          const onlineUsers = users.filter(u => u !== username);
          const suggestions = onlineUsers.filter(user =>
            user.toLowerCase().startsWith(searchTerm)
          );
          setMentionSuggestions(suggestions);
          setShowSuggestions(suggestions.length > 0);
        } else {
          setShowSuggestions(false);
        }
    } else {
        setShowSuggestions(false); // No suggestions in private chats
    }
  };
  
  // --- NEW: Function to handle selecting a user from suggestions ---
  const handleMentionSelect = (selectedUser) => {
    const words = messageInput.split(" ");
    words.pop(); // Remove the partial @mention
    words.push(`@${selectedUser} `); // Add the full mention with a space
    setMessageInput(words.join(" "));
    setShowSuggestions(false);
  };

  function handleTyping() {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    const isPrivateChat = activeChat !== room;
    const recipient = isPrivateChat ? activeChat : null;
    socket.emit("typing", { room, isTyping: true, recipient });
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing", { room, isTyping: false, recipient });
    }, 2000);
  }

  function handleKeyDown(event) {
    handleTyping();
    if (event.key === 'Enter') {
      event.preventDefault();
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
      <div className="login-page-wrapper">
        <ParticleBackground />
        <div className="login-container">
          <h2>Lan Chat</h2>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter username" />
          <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Enter room name" />
          <button onClick={handleJoinChat}>Join</button>
        </div>
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
                <div className="avatar" style={{ backgroundColor: getColorFromName(user) }}>
                  {getInitials(user)}
                </div>
                {user}
              </li>
            ))}
          </ul>
        </div>
        <div className="sidebar-footer">
          <div className="current-user-display">
            <div className="avatar" style={{ backgroundColor: getColorFromName(username) }}>
                {getInitials(username)}
            </div>
            <div className="user-info">
                <strong>{username}</strong>
                <span>Logged In</span>
            </div>
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
            <div key={index} className={`message-wrapper ${(msg.user || msg.from) === username ? "my-message-wrapper" : "other-message-wrapper"}`}>
              <div className="avatar" style={{ backgroundColor: getColorFromName(msg.user || msg.from) }}>
                  {getInitials(msg.user || msg.from)}
              </div>
              <div className={`message ${(msg.user || msg.from) === username ? "my-message" : "other-message"}`}>
                  <div className="message-content">
                      <strong>{`${msg.user || msg.from}: `}</strong>
                      {`${msg.text}`}
                  </div>
                  <div className="message-timestamp">
                      {msg.timestamp && new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="typing-indicator">{typingDisplay}</div>
        <div className="message-input-area">
            {showSuggestions && (
                <div className="mention-suggestions">
                    {mentionSuggestions.map(user => (
                        <div key={user} className="mention-item" onClick={() => handleMentionSelect(user)}>
                            {user}
                        </div>
                    ))}
                </div>
            )}
          <button className="icon-button">
            <IoAttach size={22} />
          </button>
          <input 
            value={messageInput} 
            onChange={handleInputChange} 
            onKeyDown={handleKeyDown} 
            placeholder={`Message ${activeChat}`} 
          />
          <button onClick={handleSendMessage} className="icon-button send-button">
            <IoSend size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}