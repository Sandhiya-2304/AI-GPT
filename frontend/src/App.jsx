import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useIsAuthenticated } from "@azure/msal-react";
import ProtectedRoute from "./ProtectedRoute";
import Login from "./Login";
import Chat from "./Chat";

export default function App() {
  const isAuthenticated = useIsAuthenticated();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/chat/:chatId" element={<Chat />} />
        </Route>
        <Route
          path="/"
          element={<Navigate to={isAuthenticated ? "/chat/new" : "/login"} replace />}
        />
        <Route
          path="*"
          element={<Navigate to={isAuthenticated ? "/chat/new" : "/login"} replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}