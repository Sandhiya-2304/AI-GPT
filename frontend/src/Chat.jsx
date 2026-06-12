import { useState, useEffect, useRef } from "react";
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

  const [msg, setMsg] = useState("");
  const [chat, setChat] = useState([]);
  const [threads, setThreads] = useState([]);

  const [isTyping, setIsTyping] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  const [showMenu, setShowMenu] = useState(false);
  const [mode, setMode] = useState("chat"); // chat | image | video
  const [previewMedia, setPreviewMedia] = useState(null);

  const isNewChat = routeChatId === "new";
  const idRef = useRef(0);
  const getId = () => ++idRef.current;

  /* ================= THREADS ================= */
  useEffect(() => {
    if (!userId) return;

    (async () => {
      const res = await fetch(
        `http://localhost:5000/api/history/threads?userId=${userId}`
      );
      const data = await res.json();
      setThreads(data.threads || []);
    })();
  }, [userId]);

  /* ================= LOAD CHAT ================= */
  useEffect(() => {
    if (!userId || isNewChat) return;

    let ignore = false;

    (async () => {
      const res = await fetch("http://localhost:5000/api/chat/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: routeChatId,
          userId,
        }),
      });

      const data = await res.json();

      if (!data.success || ignore) return;

      setChat(
        data.messages.map((m) => ({
          id: m.id,
          role: m.role,
          contentType: m.contentType,
          text: m.text || "",
          mediaUrl: m.mediaUrl || null,
        }))
      );
    })();

    return () => {
      ignore = true;
    };
  }, [routeChatId, userId, isNewChat]);

  /* ================= SEND MESSAGE ================= */
  const sendMessage = async () => {
    if (!msg.trim() || !userId) return;

    const text = msg;
    setMsg("");

    const activeChatId = isNewChat ? generateChatId() : routeChatId;

    if (isNewChat) {
      setChat([]);
      navigate(`/chat/${activeChatId}`, { replace: true });
    }

    // USER MESSAGE
    setChat((prev) => [
      ...prev,
      {
        id: getId(),
        role: "user",
        text,
        contentType: "text",
      },
    ]);

    const token = await instance.acquireTokenSilent({
      account,
      scopes: ["User.Read"],
    });

   if (mode === "image") {
  setIsGeneratingImage(true);
  setIsTyping(false);
} else if (mode === "video") {
  setIsGeneratingImage(true);
  setIsTyping(false);
} else {
  setIsTyping(true);
  setIsGeneratingImage(false);
}

    const payloadMessage =
      mode === "image"
        ? `/image ${text}`
        : mode === "video"
        ? `/video ${text}`
        : text;

    const res = await fetch("http://localhost:5000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: payloadMessage,
        chatId: activeChatId,
        userId,
        token: token.accessToken,
      }),
    });

    const data = await res.json();

    setIsTyping(false);
    setIsGeneratingImage(false);

    if (!data.success) return;

    // BOT MESSAGE (FIXED: supports image/video/text)
    setChat((prev) => [
      ...prev,
      {
        id: getId(),
        role: "bot",
        text: data.answer || "",
        contentType: data.type || "chat",
        mediaUrl: data.mediaUrl || null,
      },
    ]);

    // refresh threads
    const res2 = await fetch(
      `http://localhost:5000/api/history/threads?userId=${userId}`
    );
    const data2 = await res2.json();
  if (Array.isArray(data2.threads)) {
  setThreads(data2.threads);
}
  };
  

  /* ================= DELETE THREAD ================= */
  const deleteThread = async (id) => {
    await fetch(`http://localhost:5000/api/chat/${id}?userId=${userId}`, {
      method: "DELETE",
    });

    setThreads((prev) => prev.filter((t) => t.chatId !== id));
  };

  /* ================= LOGOUT ================= */
  const logout = () => instance.logoutRedirect();
const downloadFile = async (url, filename = "file") => {
  try {
    const res = await fetch(url, { mode: "cors" });

    if (!res.ok) throw new Error("Network error");

    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;

    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(blobUrl);

    alert("✅ Download successful");
  } catch (err) {
    console.error(err);
    alert("❌ Download failed (CORS or invalid URL)");
  }
};
  return (
    <div className="app">

      {/* SIDEBAR */}
      <div className="sidebar">

        <div className="profile">
          <div className="avatar">{account?.name?.[0]}</div>
          <div>
            <div className="name">{account?.name}</div>
            <div className="email">{account?.username}</div>
          </div>
        </div>
         <button
  className="newChat"
  onClick={() => {
    setChat([]);
    navigate("/chat/new");
  }}
>
  + New Chat
</button>
       

        <div className="threads">
          {threads.map((t) => (
            <div key={t.chatId} className="thread">
              <span onClick={() => navigate(`/chat/${t.chatId}`)}>
                {t.title || "Chat"}
              </span>
              <button onClick={() => deleteThread(t.chatId)}>✕</button>
            </div>
          ))}
        </div>

        <button className="logout" onClick={logout}>
          Logout
        </button>

      </div>

      {/* CHAT AREA */}
      <div className="chat">

        <div className="messages">
          <div className="chatHeader">AI Assistant</div>

          {chat.map((m) => (
            <div key={m.id} className={`msg ${m.role}`}>

              {m.role === "bot" && (
                <div className="aiLabel">AI Assistant</div>
              )}

          {m.contentType === "image" && m.mediaUrl && (
  <div className="mediaWrapper">
    <img
      src={m.mediaUrl}
      alt="generated"
      onClick={() =>
        setPreviewMedia({ type: "image", url: m.mediaUrl })
      }
    />

    <button
      className="downloadBtn"
      onClick={() => downloadFile(m.mediaUrl, "image.png")}
    >
      ⬇
    </button>
  </div>
)}

{m.contentType === "video" && m.mediaUrl && (
  <div className="mediaWrapper">
    <video
  src={m.mediaUrl}
  controls
  autoPlay
  muted
  style={{ maxWidth: "100%" }}
/>
    <button
      className="downloadBtn"
      onClick={() => downloadFile(m.mediaUrl, "video.mp4")}
    >
      ⬇
    </button>
  </div>
)}

              {m.contentType === "text" && <div>{m.text}</div>}

            </div>
          ))}

         {isTyping && mode === "chat" && (
  <div className="msg bot">Typing...</div>
)}

{isGeneratingImage && (
  <div className="msg bot">
    {mode === "image"
      ? "🎨 Generating image..."
      : "🎬 Generating video..."}
  </div>
)}
{previewMedia && (
  <div className="fullscreenOverlay" onClick={() => setPreviewMedia(null)}>

    <div className="fullscreenBox" onClick={(e) => e.stopPropagation()}>

      {previewMedia.type === "image" ? (
        <img src={previewMedia.url} className="fullscreenMedia" />
      ) : (
        <video src={previewMedia.url} controls autoPlay className="fullscreenMedia" />
      )}

      {/* SIDE ACTIONS */}
      <div className="mediaActions">

        <button onClick={() => downloadFile(previewMedia.url, "file")}>
          ⬇ Download
        </button>

        <button
          onClick={() =>
            navigator.share
              ? navigator.share({ url: previewMedia.url })
              : alert("Sharing not supported")
          }
        >
          🔗 Share
        </button>

        <button onClick={() => setPreviewMedia(null)}>
          ❌ Close
        </button>

      </div>

    </div>
  </div>
)}
        </div>

        {/* INPUT */}
        <div className="inputBox">

          <div className="plusWrapper">
            <button onClick={() => setShowMenu(!showMenu)}>➕</button>

            {showMenu && (
              <div className="dropdown">
                <div onClick={() => { setMode("image"); setShowMenu(false); }}>
                  🖼 Image Generator
                </div>

                <div onClick={() => { setMode("video"); setShowMenu(false); }}>
                  🎥 Video Generator
                </div>

                <div onClick={() => { setMode("chat"); setShowMenu(false); }}>
                  💬 Chat Mode
                </div>
              </div>
            )}
          </div>

          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder={
              mode === "image"
                ? "Describe image..."
                : mode === "video"
                ? "Describe video..."
                : "Ask something..."
            }
          />

          <button onClick={sendMessage}>Send</button>

        </div>

      </div>
    </div>
  );
}