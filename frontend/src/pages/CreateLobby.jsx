import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "../socket";
import "./CreateLobby.css";

function CreateLobby() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const name = sessionStorage.getItem("username") || "Player";

  useEffect(() => {
    const register = () => {
      socket.emit("registerUser", { username: name });
    };

    if (socket.connected) {
      register();
    } else {
      socket.connect();
    }

    socket.on("connect", register);

    return () => {
      socket.off("connect");
    };
  }, [name]);

  const handleCreateLobby = () => {
    setLoading(true);

    console.log("Creating lobby with:", name);

    socket.emit("createLobby", { name }, (res) => {
      setLoading(false);

      console.log("Server response:", res);

      if (!res?.lobbyId) {
        alert("Failed to create lobby");
        return;
      }

      sessionStorage.setItem("lobbyId", res.lobbyId);

      // ✅ NAVIGATE
      navigate(`/lobby/${res.lobbyId}`);
    });
  };

  return (
    <div className="create-lobby-page">
      <div className="create-card">
        <h1>Create Lobby</h1>

        <p>
          Welcome <b>{name}</b>
        </p>

        <button onClick={handleCreateLobby} disabled={loading}>
          {loading ? "Creating..." : "Create Lobby"}
        </button>
      </div>
    </div>
  );
}

export default CreateLobby;