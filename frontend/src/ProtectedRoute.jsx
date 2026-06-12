import { Navigate, Outlet } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";

export default function ProtectedRoute() {
  const { inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  if (inProgress !== "none") {
    return <div>Loading...</div>;
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}