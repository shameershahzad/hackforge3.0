import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { socket } from "../socket";
import "./Lobby.css";

function Lobby() {
  const { lobbyId } = useParams();
  const navigate = useNavigate();

  const [players, setPlayers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [onlinePlayers, setOnlinePlayers] = useState([]);
  const [hostUsername, setHostUsername] = useState("");

  const name = sessionStorage.getItem("username") || "Player";

  useEffect(() => {
    const register = () => {
      socket.emit("registerUser", { username: name });
      socket.emit("joinLobbyAsViewer", { lobbyId, username: name });
    };

    if (socket.connected) {
      register();
    } else {
      socket.connect();
    }

    socket.on("connect", register);

    // ✅ lobby details
    socket.on("lobbyDetails", (details) => {
      if (details?.hostUsername) {
        setHostUsername(details.hostUsername);
      }
    });

    // ✅ live players update
    socket.on("lobbyUpdate", (data) => {
      setPlayers(data);
    });

    // ✅ new join request from players
    socket.on("newRequest", (req) => {
      setRequests((prev) => {
        if (prev.some(r => r.socketId === req.socketId)) return prev;
        return [...prev, req];
      });
    });

    // ✅ request list sync update
    socket.on("requestUpdate", (data) => {
      setRequests(data);
    });

    // ✅ online players list update
    socket.on("onlinePlayersUpdate", (data) => {
      setOnlinePlayers(data);
    });

    // ✅ request rejected
    socket.on("requestRejected", () => {
      alert("Your request was rejected.");
      navigate("/dashboard");
    });

    // ✅ kicked from lobby
    socket.on("kickedFromLobby", () => {
      alert("You have been removed from the lobby by the host.");
      navigate("/dashboard");
    });

    // ✅ game start redirect
    socket.on("gameStart", ({ lobbyId }) => {
      navigate(`/arena/${lobbyId}`);
    });

    return () => {
      socket.off("connect");
      socket.off("lobbyDetails");
      socket.off("lobbyUpdate");
      socket.off("newRequest");
      socket.off("requestUpdate");
      socket.off("onlinePlayersUpdate");
      socket.off("requestRejected");
      socket.off("kickedFromLobby");
      socket.off("gameStart");
    };
  }, [lobbyId, name, navigate]);

  // ✅ accept player request
  const acceptUser = (socketId) => {
    socket.emit("acceptRequest", { lobbyId, socketId });
  };

  // ✅ reject player request
  const rejectUser = (socketId) => {
    socket.emit("rejectRequest", { lobbyId, socketId });
  };

  // ✅ add player directly
  const addPlayerToLobby = (socketId) => {
    socket.emit("addPlayerToLobby", { lobbyId, socketId });
  };

  // ✅ remove player / kick from lobby
  const removePlayer = (socketId) => {
    socket.emit("removePlayerFromLobby", { lobbyId, socketId });
  };

  // ✅ start game
  const startGame = () => {
    socket.emit("startGame", { lobbyId });
  };

  const isHost = hostUsername.trim().toLowerCase() === name.trim().toLowerCase();

  console.log(`[Lobby] Rendering name: "${name}", hostUsername: "${hostUsername}", isHost: ${isHost}`);
  console.log(`[Lobby] Active Players:`, players, `Online Players:`, onlinePlayers);

  // Filter online players to only show players who are NOT in the lobby (case-insensitive)
  const playersNotInLobby = onlinePlayers.filter(
    (op) => !players.some((p) => p.username?.trim().toLowerCase() === op.username?.trim().toLowerCase())
  );

  return (
    <div className="lobby-container">

      {/* HEADER */}
      <div className="lobby-header">
        <h2>Lobby ID: {lobbyId}</h2>
        <p>Host: {hostUsername || "Loading..."}</p>
        <button className="btn reject" onClick={() => navigate("/dashboard")} style={{ float: 'right' }}>
          Back to Dashboard
        </button>
      </div>

      <div className="lobby-grid">

        {/* PLAYERS LIST */}
        <div className="card">
          <h3>Players In Room</h3>

          {players.length === 0 && (
            <p className="muted">No players yet</p>
          )}

          {players.map((p) => {
            const playerIsHost = p.username?.trim().toLowerCase() === hostUsername?.trim().toLowerCase();
            return (
              <div key={p.socketId} className="player" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span>{p.username}</span>
                  {playerIsHost && (
                    <span className="badge badge-you" style={{ background: '#3C3489', color: '#CECBF6', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px' }}>
                      Host
                    </span>
                  )}
                </div>
                {isHost && !playerIsHost && (
                  <button
                    className="btn reject"
                    onClick={() => removePlayer(p.socketId)}
                    style={{ padding: '4px 10px', fontSize: '12px', minWidth: 'auto', margin: 0 }}
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* REQUESTS LIST (HOST CONTROL) */}
        {isHost && (
          <div className="card">
            <h3>Join Requests</h3>

            {requests.length === 0 && (
              <p className="muted">No pending requests</p>
            )}

            {requests.map((r) => (
              <div key={r.socketId} className="request">
                <span>{r.name}</span>

                <div className="btn-group">
                  <button
                    className="btn accept"
                    onClick={() => acceptUser(r.socketId)}
                  >
                    Accept
                  </button>

                  <button
                    className="btn reject"
                    onClick={() => rejectUser(r.socketId)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ONLINE PLAYERS LIST (HOST CONTROL) */}
        {isHost && (
          <div className="card">
            <h3>Online Players</h3>

            {playersNotInLobby.length === 0 && (
              <p className="muted">No other players online</p>
            )}

            {playersNotInLobby.map((op) => (
              <div key={op.socketId} className="request">
                <span>{op.username}</span>
                <button
                  className="btn accept"
                  onClick={() => addPlayerToLobby(op.socketId)}
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        )}

        {/* START GAME CARD (HOST CONTROL) */}
        {isHost && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <h3>Game Controls</h3>
            <p className="muted" style={{ textAlign: 'center', marginBottom: '15px' }}>
              Minimum 1 player required to start match.
            </p>
            <button
              className="btn accept"
              onClick={startGame}
              disabled={players.length < 1}
              style={{ width: '80%', padding: '12px', fontSize: '14px', fontWeight: 'bold' }}
            >
              Start Game →
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default Lobby;