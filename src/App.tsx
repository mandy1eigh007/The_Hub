import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { isAuthed } from "./lib/auth";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Vault from "./pages/Vault";
import Sessions from "./pages/Sessions";
import Session from "./pages/Session";
import Decisions from "./pages/Decisions";
import Loops from "./pages/Loops";
import Login from "./pages/Login";

function RequireAuth({ children }: { children: JSX.Element }) {
  if (!isAuthed()) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/vault" element={<Vault />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/sessions/:id" element={<Session />} />
          <Route path="/decisions" element={<Decisions />} />
          <Route path="/loops" element={<Loops />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
