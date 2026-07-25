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
import Room from "./pages/Room";
import Wire from "./pages/Wire";
import Tail from "./pages/Tail";
import Imp from "./pages/Imp";
import Chat from "./pages/Chat";
import NotionPage from "./pages/NotionPage";
import GitHub from "./pages/GitHub";

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
          <Route path="/"           element={<Dashboard />} />
          <Route path="/vault"      element={<Vault />} />
          <Route path="/sessions"   element={<Sessions />} />
          <Route path="/sessions/:id" element={<Session />} />
          <Route path="/decisions"  element={<Decisions />} />
          <Route path="/loops"      element={<Loops />} />
          <Route path="/room"       element={<Room />} />
          <Route path="/wire"       element={<Wire />} />
          <Route path="/tail"       element={<Tail />} />
          <Route path="/imp"        element={<Imp />} />
          <Route path="/chat"       element={<Chat />} />
          <Route path="/notion"     element={<NotionPage />} />
          <Route path="/github"     element={<GitHub />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
