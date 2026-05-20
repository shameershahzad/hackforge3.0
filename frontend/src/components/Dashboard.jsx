import { useEffect, useState } from "react";
import { socket } from "../socket";
import { useNavigate } from "react-router-dom";
import "./Dashboard.css";

function Dashboard() {
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [lobbyCode, setLobbyCode] = useState("");
  const [error, setError] = useState("");

  const username = sessionStorage.getItem("username") || "Player";
  const initials = username.slice(0, 2).toUpperCase();

  const getInitials = (name) => name.slice(0, 2).toUpperCase();

  useEffect(() => {
    const token = sessionStorage.getItem("token");
    if (!token) {
      navigate("/");
      return;
    }

    socket.auth = { token };

    const register = () => {
      console.log("Socket connected:", socket.id);
      socket.emit("registerUser", { username });
    };

    if (socket.connected) {
      register();
    } else {
      socket.connect();
    }

    socket.on("connect", register);

    socket.on("lobbyUpdate", (playerList) => {
      setPlayers(playerList);
    });

    socket.on("gameStart", () => {
      navigate("/arena");
    });

    socket.on("notEnoughPlayers", (msg) => {
      setError(msg);
    });

    socket.on("requestAccepted", ({ lobbyId }) => {
      navigate(`/lobby/${lobbyId}`);
    });

    socket.on("addedToLobby", ({ lobbyId }) => {
      alert(`You have been added to lobby: ${lobbyId}`);
      navigate(`/lobby/${lobbyId}`);
    });

    socket.on("joinRequestError", ({ message }) => {
      setError(message);
    });

    return () => {
      socket.off("connect");
      socket.off("lobbyUpdate");
      socket.off("gameStart");
      socket.off("notEnoughPlayers");
      socket.off("requestAccepted");
      socket.off("addedToLobby");
      socket.off("joinRequestError");
      socket.disconnect();
    };
  }, []);

const handleCreateLobby = () => {
  setError("");
  navigate("/create-lobby");
};

// ✅ ONLY ONE FUNCTION (FIXED)
const handleJoinLobby = () => {
  if (!lobbyCode.trim()) {
    setError("Enter lobby code first.");
    return;
  }

  setError("");

  socket.emit("joinRequest", {
    lobbyId: lobbyCode.trim(),
    name: username
  });

  setError("Request sent. Waiting for host approval...");
};

  const handleStartGame = () => {
    setError("");
    socket.emit("startGame");
  };

  const handleLogout = () => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("username");
    socket.disconnect();
    navigate("/");
  };



  return (
    <div className="pg">

      {/* Navbar */}
      <nav className="nav">
        <div className="logo">HACKFORGE 3.0</div>
        <div className="nav-right">
          <div className="av">{initials}</div>
          <span className="uname">{username}</span>
          <button className="btn-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div className="hero">
        <div>
          <h1>Arena Dashboard</h1>
          <p>Create or join a lobby to start competing</p>
        </div>
        <div className="status-pill">
          <div className="dot-live"></div>
          Connected
        </div>
      </div>

      {/* Main grid */}
      <div className="main">

        {/* Left column */}
        <div className="left-col">

          {/* Quick actions card */}
          <div className="card">
            <div className="ctitle">Quick actions</div>
            <div className="action-grid">
              <div className="action-card primary" onClick={handleCreateLobby}>
                <div className="action-icon">+</div>
                <div className="action-title">Create Lobby</div>
                <div className="action-sub">Start a new game room</div>
              </div>
              <div className="action-card" onClick={handleJoinLobby}>
                <div className="action-icon">→</div>
                <div className="action-title">Join Lobby</div>
                <div className="action-sub">Enter a room code</div>
              </div>
            </div>
            <div className="lobby-input-row">
              <input
                className="lobby-input"
                placeholder="Enter lobby code e.g. ARENA-4829"
                value={lobbyCode}
                onChange={(e) => setLobbyCode(e.target.value)}
              />
              <button className="btn btn-purple" onClick={handleJoinLobby}>
                Join
              </button>
            </div>
          </div>

          {/* Players card */}
          <div className="card">
            <div className="ctitle">Players in lobby</div>

            <div className="stat-row">
              <div className="stat">
                <div className="stat-n">{players.length}</div>
                <div className="stat-l">In lobby</div>
              </div>
              <div className="stat">
                <div className="stat-n p">2</div>
                <div className="stat-l">Min needed</div>
              </div>
              <div className="stat">
                <div className="stat-n g">4</div>
                <div className="stat-l">Max players</div>
              </div>
            </div>

            <div className="player-list">
              {players.length === 0 && (
                <div style={{ textAlign: "center", color: "#333", fontSize: "13px", padding: "16px" }}>
                  No players yet — click Create Lobby to begin
                </div>
              )}
              {players.map((player) => {
                const isYou = player.socketId === socket.id;
                return (
                  <div className="p-row" key={player.socketId}>
                    <div className={`p-dot ${isYou ? "" : "waiting"}`}></div>
                    <div
                      className="p-av"
                      style={
                        isYou
                          ? { background: "#3C3489", color: "#CECBF6" }
                          : { background: "#712B13", color: "#F5C4B3" }
                      }
                    >
                      {getInitials(player.username)}
                    </div>
                    <span className="p-name">{player.username}</span>
                    <span className={`badge ${isYou ? "badge-you" : "badge-wait"}`}>
                      {isYou ? "You · Host" : "Waiting"}
                    </span>
                  </div>
                );
              })}
            </div>

            {error && <div className="error-msg">{error}</div>}

            <button
              className="start-btn"
              onClick={handleStartGame}
              disabled={players.length < 2}
            >
              {players.length < 2
                ? `Waiting for players… (${players.length}/2)`
                : "Start Game →"}
            </button>
          </div>

        </div>

        {/* Right column */}
        <div className="right-col">

          {/* Round order */}
          <div className="card">
            <div className="ctitle">Round order</div>
            <div className="round-list">
              <div className="r-item">
                <div className="r-num ap">1</div>
                <span className="r-name ap">Orb collection</span>
              </div>
              <div className="r-item">
                <div className="r-num">2</div>
                <span className="r-name">Safe zone survival</span>
              </div>
              <div className="r-item">
                <div className="r-num">3</div>
                <span className="r-name">King of the hill</span>
              </div>
              <div className="r-item">
                <div className="r-num">4</div>
                <span className="r-name">Fog of war</span>
              </div>
              <div className="r-item final">
                <div className="r-num fn">F</div>
                <span className="r-name fn">Final — all mechanics</span>
              </div>
            </div>
          </div>

          {/* How to play */}
          <div className="card">
            <div className="ctitle">How to play</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div className="how-step">
                <span className="how-num">01</span>
                <span>Write JavaScript in the code editor to control your bot</span>
              </div>
              <div className="how-step">
                <span className="how-num">02</span>
                <span>Your bot runs every 100ms automatically — no manual control</span>
              </div>
              <div className="how-step">
                <span className="how-num">03</span>
                <span><code>move("right")</code> — bot keeps going until next command</span>
              </div>
              <div className="how-step">
                <span className="how-num">04</span>
                <span>Collect orbs, survive the zone, hold the hill to win</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Socket debug bar */}
      <div className="socket-bar">
        <span>socket: {socket.id || "connecting..."}</span>
        <span>Code Royale — HackForge 3.0</span>
      </div>

    </div>
  );
}

export default Dashboard;