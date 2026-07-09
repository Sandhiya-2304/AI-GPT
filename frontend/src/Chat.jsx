import { useEffect, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { useNavigate, useParams } from "react-router-dom";
import "./Chat.css";


const generateChatId = () => `chat_${Date.now()}`;


export default function Chat() {
  const { instance } = useMsal();
  const navigate = useNavigate();
  const { chatId: routeChatId } = useParams();


  const account = instance.getActiveAccount();
  const userId = account?.localAccountId;
  const chatId = routeChatId || "new";
  const isNewChat = chatId === "new";
  const [hoveredThread, setHoveredThread] = useState(null);
  const [chat, setChat] = useState([]);
  const [threads, setThreads] = useState([]);
  const [chatMsg, setChatMsg] = useState("");
  const [selectedOption, setSelectedOption] = useState(null);
  const [loadingMode, setLoadingMode] = useState(null);
  const [showPlushDropdown, setShowPlushDropdown] = useState(false);
  const [fullscreenMedia, setFullscreenMedia] = useState(null);


  const plushDropdownRef = useRef(null);
  const messageId = useRef(0);
  const getId = () => ++messageId.current;


  useEffect(() => {
    let ignore = false;
    if (!userId) return;


    const loadChat = async () => {
      try {
        if (!routeChatId || routeChatId === "new") {
          setChat([]);
          return;
        }


        console.log("📥 LOADING CHAT HISTORY for:", chatId);
        const res = await fetch("http://localhost:5000/api/chat/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, userId }),
        });
        const data = await res.json();
        if (ignore) return;


        if (data.success && Array.isArray(data.messages)) {
          console.log("✅ CHAT HISTORY LOADED:", data.messages.length, "messages");
          setChat(
            data.messages.map((m, index) => ({
              id: `${m.id || Date.now()}_${index}`,
              role: m.role || (m.sender === "user" ? "user" : "bot"),
              text: m.text || m.message || "",
              mediaType: m.contentType === "image" || m.contentType === "video" ? m.contentType : null,
              mediaUrl: m.mediaUrl || null,
            }))
          );
        }
      } catch (err) {
        console.error(err);
      }
    };


    loadChat();
    return () => {
      ignore = true;
    };
  }, [userId, routeChatId, chatId]);


  useEffect(() => {
    if (!userId) return;


    const fetchThreads = async () => {
      try {
        console.log("🔍 FETCHING THREADS FOR USER:", userId);
        const res = await fetch(`http://localhost:5000/api/history/threads?userId=${userId}`);
        const data = await res.json();
        console.log("🔍 THREADS DATA:", data);
        setThreads(data.threads || []);
      } catch (err) {
        console.error("❌ ERROR FETCHING THREADS:", err);
      }
    };


    fetchThreads();
  }, [userId]);


  useEffect(() => {
    if (!userId || isNewChat) return;


    const fetchThreads = async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/history/threads?userId=${userId}`);
        const data = await res.json();
        setThreads(data.threads || []);
        console.log("✅ THREADS REFRESHED AFTER CHAT SWITCH");
      } catch (err) {
        console.error("❌ ERROR FETCHING THREADS:", err);
      }
    };


    fetchThreads();
  }, [chatId, isNewChat, userId]);


 const ensureChatId = () => {
  if (isNewChat) {
    return generateChatId();
  }
  return chatId;
};


  const startNewChat = () => {
    setChat([]);
    setChatMsg("");
    setSelectedOption(null);
    setLoadingMode(null);
    setFullscreenMedia(null);
    setShowPlushDropdown(false);
    navigate("/chat/new", { replace: true });
  };


  const switchChat = (id) => {
    if (id !== chatId) {
      console.log("🔄 SWITCHING CHAT FROM", chatId, "TO", id);
      navigate(`/chat/${id}`);
    }
  };


  const logout = () => instance.logoutRedirect();


  const togglePlushDropdown = () => {
    setShowPlushDropdown((prev) => !prev);
  };


  const addAssistantStatus = (text) => {
    setChat((prev) => [...prev, { id: getId(), role: "bot", text }]);
  };


  const selectImage = () => {
    setSelectedOption("image");
    setShowPlushDropdown(false);
    setLoadingMode(null);
    addAssistantStatus("Start image generation. Type your prompt below.");
  };


  const selectVideo = () => {
    setSelectedOption("video");
    setShowPlushDropdown(false);
    setLoadingMode(null);
    addAssistantStatus("Start video generation. Type your prompt below.");
  };


  const refreshThreads = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`http://localhost:5000/api/history/threads?userId=${userId}`);
      const data = await res.json();
      setThreads(data.threads || []);
      console.log("✅ THREADS REFRESHED AFTER SENDING MESSAGE");
    } catch (err) {
      console.error("❌ ERROR REFRESHING THREADS:", err);
    }
  };

  const sendMessage = async () => {
    if (!chatMsg.trim() || !userId) return;
    
    const text = chatMsg.trim();
    setChatMsg("");


    const activeChatId = ensureChatId();


    if (selectedOption === "image") {
      setChat(prev => {
        const updated = [...prev, { id: getId(), role: "user", text: `Generate image: ${text}` }];
        console.log("✅ IMAGE: CHAT AFTER USER:", updated);
        return updated;
      });
      setLoadingMode("image");


      try {
        const res = await fetch("http://localhost:5000/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `/image ${text}`,
            chatId: activeChatId,
            userId,
          }),
        });


        const data = await res.json();
        setLoadingMode(null);
        setSelectedOption(null);


        if (data.success) {
          setChat(prev => {
            const updated = [...prev, {
              id: getId(),
              role: "bot",
              text: "Image generated",
              mediaType: "image",
              mediaUrl: data.mediaUrl,
            }];
            console.log("✅ IMAGE: CHAT AFTER BOT:", updated);
            return updated;
          });
          await refreshThreads();
      
        } else {
          addAssistantStatus(`Failed to generate image: ${data.error || "Unknown error"}`);
        }
      } catch (err) {
        setLoadingMode(null);
        setSelectedOption(null);
        addAssistantStatus(`Error generating image: ${err.message}`);
      }
      return;
    }


    if (selectedOption === "video") {
      setChat(prev => {
        const updated = [...prev, { id: getId(), role: "user", text: `Generate video: ${text}` }];
        console.log("✅ VIDEO: CHAT AFTER USER:", updated);
        return updated;
      });
      setLoadingMode("video");


      try {
        const res = await fetch("http://localhost:5000/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `/video ${text}`,
            chatId: activeChatId,
            userId,
          }),
        });


        const data = await res.json();
        setLoadingMode(null);
        setSelectedOption(null);


        if (data.success) {
          setChat(prev => {
            const updated = [...prev, {
              id: getId(),
              role: "bot",
              text: "Video generated",
              mediaType: "video",
              mediaUrl: data.mediaUrl,
            }];
            console.log("✅ VIDEO: CHAT AFTER BOT:", updated);
            return updated;
          });
          await refreshThreads();
          
        } else {
          addAssistantStatus(`Failed to generate video: ${data.error || "Unknown error"}`);
        }
      } catch (err) {
        setLoadingMode(null);
        setSelectedOption(null);
        addAssistantStatus(`Error generating video: ${err.message}`);
      }
      return;
    }


    console.log("📤 SENDING USER MESSAGE:", text);


    setChat(prev => {
      const updated = [...prev, { id: getId(), role: "user", text }];
      console.log("✅ USER MESSAGE ADDED:", updated);
      return updated;
    });


    setLoadingMode("chat");


    try {
      const token = await instance.acquireTokenSilent({
        account,
        scopes: ["User.Read"],
      });


      const res = await fetch("http://localhost:5000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          chatId: activeChatId,
          userId,
          token: token.accessToken,
        }),
      });


      const data = await res.json();
      console.log("📥 API RESPONSE:", data);
      setLoadingMode(null);


      if (data.success) {
        setChat(prev => {
          const updated = [...prev, {
            id: getId(),
            role: "bot",
            text: data.answer,
            mediaType: data.type === "image" || data.type === "video" ? data.type : null,
            mediaUrl: data.mediaUrl || null,
          }];
          console.log("✅ BOT MESSAGE ADDED:", updated);
          return updated;
        });
        await refreshThreads();
       
      } else {
        addAssistantStatus(data.error || "Failed to get response");
      }
    } catch (err) {
      console.log("❌ ERROR:", err.message);
      setLoadingMode(null);
      addAssistantStatus(`Error: ${err.message}`);
    }
  };
const getInitials = (name) => {
  if (!name) return "AI";

  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
};
  const downloadFile = async (url, filename) => {
    try {
      const response = await fetch(`http://localhost:5000/api/download-image?url=${encodeURIComponent(url)}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download failed:", error);
      addAssistantStatus(`Download failed: ${error.message}`);
    }
  };


  const deleteThread = async (e, id) => {
    e.stopPropagation();
    await fetch(`http://localhost:5000/api/chat/${id}?userId=${userId}`, { method: "DELETE" });
    setThreads((prev) => prev.filter((t) => t.chatId !== id));
    if (id === chatId) startNewChat();
  };


  return (
    <div className="app">
      <div className="sidebar">
        <div className="profile">
          <div className="avatar">
  {getInitials(account?.name || "AI")}
</div>
          <div>
            <div className="name">{account?.name || "AI Assistant"}</div>
            <div className="email">{account?.username}</div>
          </div>
        </div>


        <button type="button" className="newChat" onClick={startNewChat}>+ New Chat</button>


        <div className="threads">
          {threads.length === 0 ? (
            <div style={{ padding: "10px", color: "#888", fontSize: "14px" }}>No chats yet</div>
          ) : (
            threads.map((t) => (
              <div 
                key={t.chatId} 
                className={`thread ${t.chatId === chatId ? "active" : ""}`}
                onClick={() => switchChat(t.chatId)}
                onMouseEnter={() => setHoveredThread(t.chatId)}
                onMouseLeave={() => setHoveredThread(null)}
                style={{position: 'relative'}}
              >
                <span>{t.title?.trim() ? t.title : "AI Assistant"}</span>
                <button 
                  type="button"
                  onClick={(e) => deleteThread(e, t.chatId)}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    // background: hoveredThread === t.chatId ? '#000000' : '#ffffff',
                    color: '#928d8d',
                    border: 'none',
                    borderRadius: '5px',
                    padding: '5px 5px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    opacity: hoveredThread === t.chatId ? 1 : 0,
                    visibility: hoveredThread === t.chatId ? 'visible' : 'hidden',
                  }}
                > 🗑️</button>
              </div>
            ))
          )}
        </div>
        <button type="button" className="logout" onClick={logout}>Logout</button>
      </div>


      <div className="chat">
        <div className="header">AI Assistant</div>


        <div className="messages">
          {chat.map((m) => (
            <div key={m.id} className={`msg ${m.role}`}>
              <div>{m.text}</div>


              {m.mediaType && m.mediaUrl && (
                <div className="media-preview-wrapper">
                  {m.mediaType === "image" && (
                    <img
                      src={m.mediaUrl}
                      alt="Generated"
                      className="generated-image"
                      onClick={() => setFullscreenMedia({ type: "image", url: m.mediaUrl })}
                      onTouchStart={() => setFullscreenMedia({ type: "image", url: m.mediaUrl })}
                    />
                  )}


                  {m.mediaType === "video" && (
                    <video
                      src={m.mediaUrl}
                      controls
                      className="generated-video"
                      style={{
                        width: "100%",
                        height: "auto",
                        maxHeight: "400px",
                        borderRadius: "12px",
                      }}
                      onClick={() => setFullscreenMedia({ type: "video", url: m.mediaUrl })}
                      onTouchStart={() => setFullscreenMedia({ type: "video", url: m.mediaUrl })}
                    />
                  )}


                  {m.mediaType === "image" && (
                    <div className="media-controls">
                      <button type="button" onClick={() => downloadFile(m.mediaUrl, `image-${m.id}.png`)}>Download</button>
                    </div>
                  )}


                  {m.mediaType === "video" && (
                    <div className="media-controls">
                      <button type="button" onClick={() => downloadFile(m.mediaUrl, `video-${m.id}.mp4`)}>Download</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}


          {loadingMode === "chat" && <div className="msg bot typing">typing...</div>}
          {loadingMode === "image" && <div className="msg bot typing">creating image...</div>}
          {loadingMode === "video" && <div className="msg bot typing">creating video...</div>}
        </div>


        <div className="input-area">
          <div className="plush-dropdown-container" ref={plushDropdownRef}>
            {showPlushDropdown && (
              <div className="plush-dropdown">
                <button type="button" className="plush-option image-option" onClick={selectImage}>🖼 Generate Image</button>
                <button type="button" className="plush-option video-option" onClick={selectVideo}>🎥 Generate Video</button>
              </div>
            )}
          </div>


          <div className="input">
            <input
              value={chatMsg}
              onChange={(e) => setChatMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder={
                selectedOption === "image" 
                  ? "Generate image: type your prompt..." 
                  : selectedOption === "video" 
                    ? "Generate video: type your prompt..." 
                    : "Type message..."
              }
            />
            <div className="media-buttons">
              <button type="button" onClick={togglePlushDropdown} className="media-btn plush-btn">
                <span className="plush-icon">+</span>
              </button>
              <button type="button" onClick={sendMessage} className="send-btn">Send</button>
            </div>
          </div>
        </div>
      </div>


      {fullscreenMedia && (
        <div className="fullscreen-overlay" onClick={() => setFullscreenMedia(null)}>
          <div className="fullscreen-box" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="fullscreen-close" onClick={() => setFullscreenMedia(null)}>
              ✕
            </button>


            {fullscreenMedia.type === "image" && (
              <img
                src={fullscreenMedia.url}
                alt="Fullscreen"
                className="fullscreen-image"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              />
            )}


            {fullscreenMedia.type === "video" && (
              <video
                src={fullscreenMedia.url}
                controls
                autoPlay
                className="fullscreen-video"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              />
            )}


            <button
              type="button"
              className="fullscreen-download"
              onClick={() => downloadFile(fullscreenMedia.url, fullscreenMedia.type === "image" ? "download.png" : "download.mp4")}
            >
              Download
            </button>
          </div>
        </div>
      )}
    </div>
  );
}