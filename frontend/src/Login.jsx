import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { loginRequest } from "./authConfig";
import "./Login.css";

export default function Login() {
  const { instance, inProgress } = useMsal();
  
  const navigate = useNavigate();
const isAuthenticated = useIsAuthenticated();

useEffect(() => {
  if (isAuthenticated) {
    navigate("/chat/new", { replace: true });
  }
}, [isAuthenticated, navigate]);
  const handleLogin = () => {
    if (inProgress !== "none") return;
   instance.loginRedirect({
  ...loginRequest,
  prompt: "select_account",
});
  };

  const isBusy = inProgress !== "none";

 return (
  <div className="login-page">
    <div className="login-card">
      <div className="microsoft-logo">
        <div className="square red"></div>
        <div className="square green"></div>
        <div className="square blue"></div>
        <div className="square yellow"></div>
      </div>

      <h1>Sign in</h1>
      <p className="subtitle">
        Sign in with your Microsoft account to continue
      </p>

      <button
        className="ms-login-btn"
        onClick={handleLogin}
        disabled={isBusy}
      >
        <span className="ms-icon">⊞</span>
        {isBusy ? "Signing in..." : "Sign in with Microsoft"}
      </button>

      <p className="footer-text">
        Secure authentication powered by Microsoft Entra ID
      </p>
    </div>
  </div>
);
}