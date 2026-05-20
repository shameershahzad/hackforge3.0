import { useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';

import Login from './UserAuthentication/Login';
import SignUp from './UserAuthentication/SignUp';
import Dashboard from './components/Dashboard'
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import CreateLobby from './pages/CreateLobby';
import Lobby from "./pages/Lobby";
import Arena from "./pages/Arena";
import './App.css';

function App() {
  useEffect(() => {
    const token = sessionStorage.getItem("token");
    if (token) {
      try {
        const decoded = jwtDecode(token);
        const now = Date.now() / 1000;

        if (decoded.exp < now) {
          // Token expired
          sessionStorage.removeItem("token");
          window.location.href = "/";
        }
      } catch (err) {
        // Invalid token
        sessionStorage.removeItem("token");
        window.location.href = "/";
        console.log(err)
      }
    }
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/signUp" element={<SignUp />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/create-lobby" element={<CreateLobby />} />
        <Route path="/lobby/:lobbyId" element={<Lobby />} />
        <Route path="/arena/:lobbyId" element={<Arena />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
