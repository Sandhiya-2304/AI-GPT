
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

  const [chat, setChat] = useState([]);
  const [threads, setThreads] = useState([]);
  const [chatMsg, setChatMsg] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [videoPrompt, setVideoPrompt] = useState("");
  const [loadingMode, setLoadingMode] = useState(null);
  const [showPlushDropdown, setShowPlushDropdown] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [selectedImageForEdit, setSelectedImageForEdit] = useState(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [fullscreenMedia, setFullscreenMedia] = useState(null);

  const plushDropdownRef = useRef(null);
  const messageId = useRef(0);
  const getId = () => ++messageId.current;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (plushDropdownRef.current && !plushDropdownRef.current.contains(e.target)) {
        setShowPlushDropdown(false);
        setSelectedOption(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    const fetchThreads = async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/history/threads?userId=${userId}`);
        const data = await res.json();
        setThreads(data.threads || []);
      } catch (err) {
        console.error(err);
      }
    };

    fetchThreads();
  }, [userId]);

  useEffect(() => {
    let ignore = false;
    if (!userId || isNewChat) return;

    const loadChat = async () => {
      try {
        const res = await fetch("http://localhost:5000/api/chat/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, userId }),
        });
        const data = await res.json();
        if (ignore) return;

        if (data.success && Array.isArray(data.messages)) {
          setChat(
            data.messages.map((m, index) => ({
              id: `${Date.now()}_${index}`,
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
  }, [chatId, userId, isNewChat]);

  const reloadThreads = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`http://localhost:5000/api/history/threads?userId=${userId}`);
      const data = await res.json();
      setThreads(data.threads || []);
    } catch (err) {
      console.error(err);
    }
  };

  const ensureChatId = () => {
    if (isNewChat) {
      const newId = generateChatId();
      navigate(`/chat/${newId}`, { replace: true });
      return newId;
    }
    return chatId;
  };

  const startNewChat = () => {
    setChat([]);
    setChatMsg("");
    setImagePrompt("");
    setVideoPrompt("");
    setEditPrompt("");
    setSelectedImageForEdit(null);
    setSelectedOption(null);
    setLoadingMode(null);
    setFullscreenMedia(null);
    navigate("/chat/new");
  };

  const switchChat = (id) => {
    if (id !== chatId) navigate(`/chat/${id}`);
  };

  const logout = () => instance.logoutRedirect();

  const togglePlushDropdown = () => {
    setShowPlushDropdown((prev) => !prev);
    if (showPlushDropdown) setSelectedOption(null);
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


  const sendMessage = async () => {
    if (!chatMsg.trim() || !userId) return;
    const text = chatMsg.trim();
    setChatMsg("");

    const activeChatId = ensureChatId();
    setChat((prev) => [...prev, { id: getId(), role: "user", text }]);
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
      setLoadingMode(null);

      if (data.success) {
        setChat((prev) => [
          ...prev,
          {
            id: getId(),
            role: "bot",
            text: data.answer,
            mediaType: data.type === "image" || data.type === "video" ? data.type : null,
            mediaUrl: data.mediaUrl || null,
          },
        ]);
        if (isNewChat) setTimeout(reloadThreads, 700);
      } else {
        addAssistantStatus(data.error || "Failed to get response");
      }
    } catch (err) {
      setLoadingMode(null);
      addAssistantStatus(`Error: ${err.message}`);
    }
  };

  const generateImage = async () => {
    const prompt = imagePrompt.trim();
    if (!prompt || !userId) return;

    const activeChatId = ensureChatId();
    setLoadingMode("image");
    setChat((prev) => [...prev, { id: getId(), role: "user", text: `Generate image: ${prompt}` }]);

    try {
      const res = await fetch("http://localhost:5000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `/image ${prompt}`,
          chatId: activeChatId,
          userId,
        }),
      });

      const data = await res.json();
      setLoadingMode(null);
      setImagePrompt("");

      if (data.success) {
        setChat((prev) => [
          ...prev,
          {
            id: getId(),
            role: "bot",
            text: "Image generated",
            mediaType: "image",
            mediaUrl: data.mediaUrl,
          },
        ]);
        if (isNewChat) setTimeout(reloadThreads, 700);
      } else {
        addAssistantStatus(`Failed to generate image: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      setLoadingMode(null);
      addAssistantStatus(`Error generating image: ${err.message}`);
    }
  };

  const generateVideo = async () => {
    const prompt = videoPrompt.trim();
    if (!prompt || !userId) return;

    const activeChatId = ensureChatId();
    setLoadingMode("video");
    setChat((prev) => [...prev, { id: getId(), role: "user", text: `Generate video: ${prompt}` }]);

    try {
      const res = await fetch("http://localhost:5000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `/video ${prompt}`,
          chatId: activeChatId,
          userId,
        }),
      });

      const data = await res.json();
      setLoadingMode(null);
      setVideoPrompt("");

      if (data.success) {
        setChat((prev) => [
          ...prev,
          {
            id: getId(),
            role: "bot",
            text: "Video generated",
            mediaType: "video",
            mediaUrl: data.mediaUrl,
          },
        ]);
        if (isNewChat) setTimeout(reloadThreads, 700);
      } else {
        addAssistantStatus(`Failed to generate video: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      setLoadingMode(null);
      addAssistantStatus(`Error generating video: ${err.message}`);
    }
  };

  const editImage = async () => {
    const prompt = editPrompt.trim();
    if (!prompt || !selectedImageForEdit || !userId) return;

    setLoadingMode("edit");
    const activeChatId = ensureChatId();

    try {
      const res = await fetch("http://localhost:5000/api/edit-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          imageUrl: selectedImageForEdit.mediaUrl,
          userId,
          chatId: activeChatId,
        }),
      });

      const data = await res.json();
      setLoadingMode(null);
      setEditPrompt("");
      setSelectedImageForEdit(null);
      setSelectedOption(null);

      if (data.success) {
        setChat((prev) => [
          ...prev,
          {
            id: getId(),
            role: "bot",
            text: "Image updated",
            mediaType: "image",
            mediaUrl: data.mediaUrl,
          },
        ]);
      } else {
        addAssistantStatus(`Failed to edit image: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      setLoadingMode(null);
      addAssistantStatus(`Error editing image: ${err.message}`);
    }
  };

  const downloadFile = (url, filename) => {
    // Simple direct download (works because containers are public)
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
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
          <div className="avatar">{(account?.name || "AI")[0]}</div>
          <div>
            <div className="name">{account?.name || "AI Assistant"}</div>
            <div className="email">{account?.username}</div>
          </div>
        </div>

        <button type="button" className="newChat" onClick={startNewChat}>+ New Chat</button>

        <div className="threads">
          {threads.map((t) => (
            <div key={t.chatId} className={`thread ${t.chatId === chatId ? "active" : ""}`} onClick={() => switchChat(t.chatId)}>
              <span>{t.title?.trim() ? t.title : "AI Assistant"}</span>
              <button type="button" onClick={(e) => deleteThread(e, t.chatId)}>✕</button>
            </div>
          ))}
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
          {loadingMode === "edit" && <div className="msg bot typing">updating image...</div>}
        </div>

        <div className="input-area">
          <div className="plush-dropdown-container" ref={plushDropdownRef}>
            {showPlushDropdown && (
              <div className="plush-dropdown">
                <button type="button" className="plush-option image-option" onClick={selectImage}>🖼 Generate Image</button>
                <button type="button" className="plush-option video-option" onClick={selectVideo}>🎥 Generate Video</button>
              </div>
            )}

            {selectedOption === "image" && (
              <div className="prompt-input-container">
                <div className="prompt-label">Start image generation</div>
                <input
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && generateImage()}
                  placeholder="Describe the image you want..."
                  className="prompt-input"
                />
                <button type="button" className="generate-btn image-gen-btn" onClick={generateImage} disabled={!imagePrompt.trim() || loadingMode !== null}>
                  Create Image
                </button>
              </div>
            )}

            {selectedOption === "video" && (
              <div className="prompt-input-container">
                <div className="prompt-label">Start video generation</div>
                <input
                  value={videoPrompt}
                  onChange={(e) => setVideoPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && generateVideo()}
                  placeholder="Describe the video you want..."
                  className="prompt-input"
                />
                <button type="button" className="generate-btn video-gen-btn" onClick={generateVideo} disabled={!videoPrompt.trim() || loadingMode !== null}>
                  Create Video
                </button>
              </div>
            )}

            {selectedOption === "edit" && selectedImageForEdit && (
              <div className="prompt-input-container">
                <div className="prompt-label">Edit this image</div>
                <input
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && editImage()}
                  placeholder="Describe the change..."
                  className="prompt-input"
                />
                <button type="button" className="generate-btn image-gen-btn" onClick={editImage} disabled={!editPrompt.trim() || loadingMode !== null}>
                  Apply Edit
                </button>
              </div>
            )}
          </div>

          <div className="input">
            <input
              value={chatMsg}
              onChange={(e) => setChatMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type message..."
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