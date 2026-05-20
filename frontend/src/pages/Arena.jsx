import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { socket } from "../socket";
import "./Arena.css";

// Synthesize sound effects using Web Audio API (no assets required)
class AudioSynth {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  playCollect() {
    if (this.muted) return;
    this.init();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, this.ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.1); // A5

    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  playDamage() {
    if (this.muted) return;
    this.init();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(40, this.ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  playFinish() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const playTone = (freq, start, duration) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.1, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };
    playTone(523.25, now, 0.15); // C5
    playTone(659.25, now + 0.15, 0.15); // E5
    playTone(783.99, now + 0.3, 0.15); // G5
    playTone(1046.5, now + 0.45, 0.4); // C6
  }
}

const synth = new AudioSynth();

function Arena() {
  const { lobbyId } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef(null);

  const name = sessionStorage.getItem("username") || "Player";

  // Pre-filled smart bot logic to handle all rounds autonomously
  const defaultCode = `// Code Royale Autononomous Bot
if (round === 2 || round === 5) {
  // Shrinking Safe Zone: Move to zone center if boundary threatens
  let distToSafe = Math.hypot(x - safeZone.x, y - safeZone.y);
  if (distToSafe > safeZone.r - 30) {
    if (safeZone.x > x) move("right");
    else move("left");
  } else {
    huntOrbs();
  }
} else if (round === 3) {
  // King of the Hill: Move into the hill, and jiggle to stay active
  let cx = controlPoint.x + controlPoint.w / 2;
  let cy = controlPoint.y + controlPoint.h / 2;
  let distToHill = Math.hypot(x - cx, y - cy);
  if (distToHill > 25) {
    if (cx > x) move("right");
    else move("left");
  } else {
    let directions = ["left", "right", "up", "down"];
    move(directions[Math.floor(Math.random() * 4)]);
  }
} else if (round === 4) {
  // Fog of War: Scan enemies periodically and head for orbs
  if (scanCount > 0) {
    scan();
  }
  huntOrbs();
} else {
  // Orb Collection / Default Round
  huntOrbs();
}

function huntOrbs() {
  if (orbs.length > 0) {
    let closest = orbs[0];
    let minDist = Math.hypot(closest.x - x, closest.y - y);
    for (let i = 1; i < orbs.length; i++) {
      let d = Math.hypot(orbs[i].x - x, orbs[i].y - y);
      if (d < minDist) {
        minDist = d;
        closest = orbs[i];
      }
    }
    if (Math.abs(closest.x - x) > Math.abs(closest.y - y)) {
      if (closest.x > x) move("right");
      else move("left");
    } else {
      if (closest.y > y) move("down");
      else move("up");
    }
  } else {
    move("right");
  }
}`;

  const [code, setCode] = useState(defaultCode);
  const [gameState, setGameState] = useState(null);
  const [muted, setMuted] = useState(false);
  const [particles, setParticles] = useState([]);
  const [activeNotification, setActiveNotification] = useState("");
  const [gameResult, setGameResult] = useState(null);
  const [codeSubmitted, setCodeSubmitted] = useState(false);
  const [syntaxError, setSyntaxError] = useState(null);
  const [replayHistory, setReplayHistory] = useState(null);

  // Sync state variables to refs to use in render ticks
  const particlesRef = useRef([]);
  const shakeTimeRef = useRef(0);
  const hasQuitRef = useRef(false);

  useEffect(() => {
    // Force register and connect
    socket.emit("registerUser", { username: name });

    // Join room
    socket.emit("joinLobbyAsViewer", { lobbyId, username: name });

    // Submit initial default code
    socket.emit("submitCode", { lobbyId, code: defaultCode });

    // Socket Event Handlers
    socket.on("gameStateUpdate", (state) => {
      setGameState(state);

      // Check damage sound
      const selfPlayer = state.players.find(p => p.username === name);
      if (selfPlayer && selfPlayer.isAlive && selfPlayer.health < 100) {
        // Play damage if health decreases (comparing with previous)
        const previousSelf = gameState?.players?.find(p => p.username === name);
        if (previousSelf && selfPlayer.health < previousSelf.health) {
          synth.playDamage();
          shakeTimeRef.current = 5; // Trigger canvas shake
        }
      }
    });

    socket.on("orbCollected", ({ username, x, y }) => {
      // Play sound
      synth.playCollect();

      // Create burst particles
      for (let i = 0; i < 10; i++) {
        particlesRef.current.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 0.5) * 6,
          color: username === name ? "#a78bfa" : "#34d399",
          alpha: 1,
          size: Math.random() * 3 + 2
        });
      }
    });

    socket.on("roundCompleted", ({ round, nextRound }) => {
      setActiveNotification(`Round ${round} Completed! Starting Round ${nextRound}...`);
      setTimeout(() => setActiveNotification(""), 3500);
    });

    socket.on("gameFinished", ({ scoreboard, analysis, history }) => {
      if (hasQuitRef.current) return;
      synth.playFinish();
      setGameResult({ scoreboard, analysis });
      setReplayHistory(history);
    });

    // Run particle loop
    let animId;
    const updateParticles = () => {
      particlesRef.current = particlesRef.current
        .map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          alpha: p.alpha - 0.05
        }))
        .filter(p => p.alpha > 0);
      animId = requestAnimationFrame(updateParticles);
    };
    const handleKeyDown = (e) => {
      // Don't steer if typing inside the code editor or any inputs
      if (document.activeElement.tagName === "TEXTAREA" || document.activeElement.tagName === "INPUT") {
        return;
      }
      const key = e.key.toLowerCase();
      let direction = null;
      if (key === "arrowup" || key === "w") {
        direction = "up";
      } else if (key === "arrowdown" || key === "s") {
        direction = "down";
      } else if (key === "arrowleft" || key === "a") {
        direction = "left";
      } else if (key === "arrowright" || key === "d") {
        direction = "right";
      }
      if (direction) {
        e.preventDefault();
        socket.emit("manualMove", { lobbyId, direction });
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      socket.off("gameStateUpdate");
      socket.off("orbCollected");
      socket.off("roundCompleted");
      socket.off("gameFinished");
      window.removeEventListener("keydown", handleKeyDown);
      cancelAnimationFrame(animId);
    };
  }, [lobbyId, name]);

  // Handle Quit/Exit Match without showing scorecard
  const handleQuitMatch = () => {
    hasQuitRef.current = true;
    setGameResult(null);
    socket.emit("leaveLobby", { lobbyId });
    navigate("/dashboard");
  };

  const handleDpadMove = (direction) => {
    socket.emit("manualMove", { lobbyId, direction });
    console.log(`[D-Pad] Manually steered bot: ${direction}`);
  };

  // Handle Mute
  const handleToggleMute = () => {
    synth.muted = !muted;
    setMuted(!muted);
  };

  // Submit current code
  const handleSubmitCode = () => {
    if (syntaxError) {
      alert("Please fix syntax errors before submitting!");
      return;
    }
    socket.emit("submitCode", { lobbyId, code });
    setCodeSubmitted(true);
    setTimeout(() => setCodeSubmitted(false), 2000);
  };

  // Handle live syntax validation
  const handleCodeChange = (val) => {
    setCode(val);
    try {
      new Function("x", "y", "health", "score", "orbs", "otherPlayers", "safeZone", "controlPoint", "round", "scanCount", "move", "scan", val);
      setSyntaxError(null);
    } catch (err) {
      setSyntaxError(err.message);
    }
  };

  // Click Canvas to steer bot manually
  const handleCanvasClick = (e) => {
    if (!canvasRef.current || !gameState) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 600;
    const clickY = ((e.clientY - rect.top) / rect.height) * 600;

    // Find self player
    const selfPlayer = gameState.players.find(p => p.username === name);
    if (!selfPlayer || !selfPlayer.isAlive) return;

    const dx = clickX - selfPlayer.x;
    const dy = clickY - selfPlayer.y;

    let dir = "right";
    if (Math.abs(dx) > Math.abs(dy)) {
      dir = dx > 0 ? "right" : "left";
    } else {
      dir = dy > 0 ? "down" : "up";
    }

    socket.emit("manualMove", { lobbyId, direction: dir });
  };

  // Download replay logs
  const downloadReplay = () => {
    if (!replayHistory) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(replayHistory, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `replay_lobby_${lobbyId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Grade calculation
  const getPerformanceGrade = (score) => {
    if (score >= 120) return { label: "S+", color: "#10b981" };
    if (score >= 80) return { label: "A+", color: "#34d399" };
    if (score >= 50) return { label: "A", color: "#60a5fa" };
    if (score >= 25) return { label: "B", color: "#f59e0b" };
    return { label: "C", color: "#ef4444" };
  };

  // Canvas drawing logic
  useEffect(() => {
    if (!canvasRef.current || !gameState) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // Clear and Save context for screen shaking
    ctx.clearRect(0, 0, 600, 600);
    ctx.save();

    if (shakeTimeRef.current > 0) {
      const dx = (Math.random() - 0.5) * 6;
      const dy = (Math.random() - 0.5) * 6;
      ctx.translate(dx, dy);
      shakeTimeRef.current--;
    }

    // 1. Draw Grid Arena Background
    ctx.fillStyle = "#0c0b14";
    ctx.fillRect(0, 0, 600, 600);
    ctx.strokeStyle = "#1b192e";
    ctx.lineWidth = 1;
    for (let i = 0; i < 600; i += 30) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 600);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(600, i);
      ctx.stroke();
    }

    // 2. Draw Obstacles (Dynamic Map Barriers)
    if (gameState.obstacles) {
      gameState.obstacles.forEach(obs => {
        ctx.fillStyle = "#161427";
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);

        // Glowing border
        ctx.strokeStyle = "#6366f1";
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
        
        // Inner design lines
        ctx.strokeStyle = "rgba(99, 102, 241, 0.25)";
        ctx.beginPath();
        ctx.moveTo(obs.x, obs.y);
        ctx.lineTo(obs.x + obs.w, obs.y + obs.h);
        ctx.moveTo(obs.x + obs.w, obs.y);
        ctx.lineTo(obs.x, obs.y + obs.h);
        ctx.stroke();
      });
    }

    // 2. Draw King of the Hill control point (Round 3, 5)
    if (gameState.round === 3 || gameState.round === 5) {
      const hill = gameState.controlPoint;
      ctx.fillStyle = "rgba(245, 158, 11, 0.08)";
      ctx.fillRect(hill.x, hill.y, hill.w, hill.h);

      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(hill.x, hill.y, hill.w, hill.h);
      ctx.setLineDash([]);

      // Draw "HILL" text
      ctx.fillStyle = "#f59e0b";
      ctx.font = "12px sans-serif";
      ctx.fillText("CONTROL HILL", hill.x + 5, hill.y - 6);
    }

    // 3. Draw Safe Zone (Round 2, 5)
    if (gameState.round === 2 || gameState.round === 5) {
      const zone = gameState.safeZone;
      // Draw outer danger area
      ctx.fillStyle = "rgba(239, 68, 68, 0.1)";
      ctx.beginPath();
      ctx.rect(0, 0, 600, 600);
      ctx.arc(zone.x, zone.y, zone.r, 0, Math.PI * 2, true);
      ctx.fill();

      // Draw Safe Zone boundary
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3;
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#ef4444";
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, zone.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0; // reset
    }

    // 4. Draw Energy Orbs
    if (gameState.round === 1 || gameState.round === 5) {
      gameState.orbs.forEach(orb => {
        ctx.fillStyle = "#10b981";
        ctx.shadowBlur = 8;
        ctx.shadowColor = "#10b981";
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });
    }

    // 5. Draw Particles
    particlesRef.current.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 6. Draw Players
    gameState.players.forEach(p => {
      if (!p.isAlive) return;

      const isSelf = p.username === name;

      // Draw scan circle if scanning (Fog of War)
      if (p.scanActive) {
        ctx.fillStyle = "rgba(167, 139, 250, 0.05)";
        ctx.strokeStyle = "rgba(167, 139, 250, 0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 150, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Draw outer pulsing energy shield to make bot clearly visible
      const radius = 22;
      const pulseRadius = radius * (1.1 + 0.18 * Math.sin(Date.now() / 130));
      ctx.save();
      ctx.fillStyle = isSelf ? "rgba(167, 139, 250, 0.12)" : "rgba(52, 211, 153, 0.12)";
      ctx.strokeStyle = isSelf ? "rgba(167, 139, 250, 0.3)" : "rgba(52, 211, 153, 0.3)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, pulseRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Draw player robot body (Glowing metallic 3D ball)
      ctx.save();
      
      // Outer glow/shadow
      ctx.shadowBlur = 24;
      ctx.shadowColor = isSelf ? "#a78bfa" : "#34d399";
      
      // Draw ball circle
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      
      // Create radial shading gradient for 3D appearance
      const grad = ctx.createRadialGradient(
        p.x - radius / 3,
        p.y - radius / 3,
        radius / 6,
        p.x,
        p.y,
        radius
      );
      
      if (isSelf) {
        grad.addColorStop(0, "#f3e8ff"); // highlights
        grad.addColorStop(0.4, "#c084fc");
        grad.addColorStop(1, "#6b21a8"); // shadow edge
      } else {
        grad.addColorStop(0, "#ecfdf5"); // highlights
        grad.addColorStop(0.4, "#34d399");
        grad.addColorStop(1, "#064e3b"); // shadow edge
      }
      
      ctx.fillStyle = grad;
      ctx.fill();
      
      // Draw glossy ring border
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // Draw Direction pointer coming out of the ball
      ctx.save();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 4.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      
      const pStart = radius - 5;
      const pEnd = radius + 12;
      
      if (p.direction === "left") {
        ctx.moveTo(p.x - pStart, p.y);
        ctx.lineTo(p.x - pEnd, p.y);
      } else if (p.direction === "right") {
        ctx.moveTo(p.x + pStart, p.y);
        ctx.lineTo(p.x + pEnd, p.y);
      } else if (p.direction === "up") {
        ctx.moveTo(p.x, p.y - pStart);
        ctx.lineTo(p.x, p.y - pEnd);
      } else if (p.direction === "down") {
        ctx.moveTo(p.x, p.y + pStart);
        ctx.lineTo(p.x, p.y + pEnd);
      }
      ctx.stroke();
      ctx.restore();

      // Name & health bar above player
      ctx.fillStyle = "white";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(p.username, p.x, p.y - 35);

      // Health bar BG
      ctx.fillStyle = "#374151";
      ctx.fillRect(p.x - 20, p.y - 29, 40, 5);

      // Health bar FG
      const healthPct = p.health / 100;
      ctx.fillStyle = healthPct > 0.5 ? "#10b981" : healthPct > 0.2 ? "#f59e0b" : "#ef4444";
      ctx.fillRect(p.x - 20, p.y - 29, 40 * healthPct, 5);
    });

    ctx.restore();
  }, [gameState]);

  // Round display names helper
  const getRoundLabel = (r) => {
    switch (r) {
      case 1: return "Round 1: Orb Collection 🟢";
      case 2: return "Round 2: Safe Zone Survival 🔴";
      case 3: return "Round 3: King of the Hill 👑";
      case 4: return "Round 4: Fog of War 🌫️";
      case 5: return "Round 5: Code Royale Finale 🔥";
      default: return "Arena Battle";
    }
  };

  return (
    <div className="arena-page">
      {/* Notifications */}
      {activeNotification && (
        <div className="game-notification banner animate-pop">
          {activeNotification}
        </div>
      )}

      {/* TOP HEADER */}
      <header className="arena-header">
        <div className="logo-group">
          <span className="live-badge">LIVE</span>
          <h1>Code Royale Arena</h1>
        </div>
        <div className="header-meta">
          <span className="room-id">Room: {lobbyId}</span>
          <button className="btn synth-mute" onClick={handleToggleMute}>
            {muted ? "🔇 Muted" : "🔊 Sound ON"}
          </button>
          <button className="btn exit-btn" onClick={handleQuitMatch}>
            Quit Match
          </button>
        </div>
      </header>

      <div className="arena-grid">
        {/* LEFT COLUMN: CODE EDITOR */}
        <div className="card editor-card">
          <div className="card-header">
            <h3>Bot Coding Terminal</h3>
            <span className="editor-status">Javascript Node VM</span>
          </div>

          <div className="editor-wrapper">
            <div className="line-numbers">
              {Array.from({ length: 45 }).map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              className="code-textarea"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              spellCheck="false"
            />
          </div>

          <div className="editor-footer" style={{ flexWrap: "wrap", gap: "8px" }}>
            <button className="btn submit-code-btn" onClick={handleSubmitCode}>
              Compile & Submit Bot Code
            </button>
            {codeSubmitted && <span className="submit-success">Code Synced!</span>}
            {syntaxError ? (
              <span style={{ color: "#f87171", fontSize: "12px", display: "block", width: "100%", marginTop: "4px" }}>
                ⚠️ Syntax Error: {syntaxError}
              </span>
            ) : (
              <span style={{ color: "#34d399", fontSize: "12px", display: "block", width: "100%", marginTop: "4px" }}>
                ✓ Code Syntax Valid
              </span>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: ARENA CANVAS & METRICS */}
        <div className="arena-right-col">
          {/* ROUND INFO */}
          <div className="card round-card">
            <div className="round-details">
              <h2>{gameState ? getRoundLabel(gameState.round) : "Round Loading..."}</h2>
              <div className="time-badge">
                Timer: {gameState ? gameState.roundTimer : 0}s
              </div>
            </div>
            <p className="round-desc">
              {gameState?.round === 1 && "Bots must seek and collect energy orbs scattered in the arena. (+10 score per orb)"}
              {gameState?.round === 2 && "Avoid the danger perimeter! Stay inside the shrinking zone. Damage scales exponentially."}
              {gameState?.round === 3 && "Secure the center Hill. Score increases dynamically when moving inside the boundary."}
              {gameState?.round === 4 && "Fog of War active! Enemies hidden unless they are nearby (<150px) or you call scan()."}
              {gameState?.round === 5 && "FINALE! Combined Orb Hunt, Shrinking Safe Zones, and King-of-the-Hill simultaneously!"}
            </p>
          </div>

          {/* CANVAS ARENA */}
          <div className="canvas-container" style={{ position: 'relative' }}>
            <canvas
              ref={canvasRef}
              width={600}
              height={600}
              onClick={handleCanvasClick}
              style={{ cursor: "pointer" }}
              title="Click on the screen to manually guide/steer your bot!"
            />
          </div>

          {/* VIRTUAL D-PAD MANUAL STEERING PAD */}
          <div className="card dpad-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '12px' }}>
            <h4 style={{ margin: '0 0 4px 0', color: '#a78bfa', fontSize: '13.5px', fontWeight: 'bold' }}>Manual D-Pad Steering Controls</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 40px)', gridTemplateRows: 'repeat(3, 40px)', gap: '6px', justifyContent: 'center' }}>
              <div />
              <button className="btn dpad-btn" onClick={() => handleDpadMove("up")} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 'bold', padding: '0' }} title="Move Up (W / ArrowUp)">▲</button>
              <div />
              <button className="btn dpad-btn" onClick={() => handleDpadMove("left")} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 'bold', padding: '0' }} title="Move Left (A / ArrowLeft)">◀</button>
              <div />
              <button className="btn dpad-btn" onClick={() => handleDpadMove("right")} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 'bold', padding: '0' }} title="Move Right (D / ArrowRight)">▶</button>
              <div />
              <button className="btn dpad-btn" onClick={() => handleDpadMove("down")} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 'bold', padding: '0' }} title="Move Down (S / ArrowDown)">▼</button>
              <div />
            </div>
            <p className="muted" style={{ fontSize: '11px', margin: '4px 0 0 0', textAlign: 'center', color: '#64748b' }}>
              Use the buttons above, click on the Arena screen, or press WASD/Arrows to override!
            </p>
          </div>

          {/* LEADERBOARD & STATS */}
          <div className="card stats-card">
            <h3>Leaderboard & Status</h3>
            <div className="player-stats-list">
              {gameState?.players.map((p) => {
                const self = p.username === name;
                return (
                  <div key={p.socketId} className={`player-row ${self ? "is-self" : ""}`}>
                    <div className="player-name-group">
                      <span className="dot" style={{ background: self ? "#a78bfa" : "#34d399" }} />
                      <span className="name">{p.username} {self && "(You)"}</span>
                    </div>

                    <div className="stat">
                      Score: <span className="val">{p.score}</span>
                    </div>

                    <div className="stat">
                      HP: <span className={`val ${p.health < 30 ? "low" : ""}`}>{p.health}%</span>
                    </div>

                    <div className="stat">
                      Scans: <span className="val">{p.scanCount}</span>
                    </div>

                    {p.error && (
                      <span className="error-pill" title={p.error}>
                        Error
                      </span>
                    )}

                    {!p.isAlive && (
                      <span className="dead-pill">
                        Eliminated
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* GAME FINISHED MODAL WITH AI ANALYSIS */}
      {gameResult && (
        <div className="game-overlay">
          <div className="card modal-card animate-pop" style={{ maxWidth: '550px', width: '90%' }}>
            <h2>🏆 Match Scorecard</h2>
            <p className="muted text-center" style={{ marginBottom: "15px" }}>Final Leaderboard Standings</p>

            <table className="scorecard-table" style={{ width: '100%', marginBottom: '20px', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#a78bfa', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Rank</th>
                  <th style={{ padding: '8px' }}>Player</th>
                  <th style={{ padding: '8px' }}>Survival</th>
                  <th style={{ padding: '8px' }}>Score</th>
                  <th style={{ padding: '8px' }}>Grade</th>
                </tr>
              </thead>
              <tbody>
                {gameResult.scoreboard.map((s) => {
                  const grade = getPerformanceGrade(s.score);
                  const secs = Math.floor(s.survivedTicks / 10);
                  return (
                    <tr key={s.username} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '8px', fontWeight: 'bold' }}>#{s.rank}</td>
                      <td style={{ padding: '8px' }}>{s.username}</td>
                      <td style={{ padding: '8px' }}>{secs}s</td>
                      <td style={{ padding: '8px', color: '#10b981', fontWeight: 'bold' }}>{s.score} pts</td>
                      <td style={{ padding: '8px' }}>
                        <span style={{ background: `${grade.color}15`, color: grade.color, padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                          {grade.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="ai-container" style={{ maxHeight: '180px', overflowY: 'auto' }}>
              <h4>🤖 AI Battle Analysis Report</h4>
              <div
                className="ai-text"
                dangerouslySetInnerHTML={{ __html: gameResult.analysis }}
              />
            </div>

            <div className="modal-actions" style={{ gap: "12px", display: "flex", justifyContent: "center" }}>
              <button className="btn accept" onClick={() => navigate("/dashboard")} style={{ padding: '10px 20px' }}>
                Return to Dashboard
              </button>
              <button className="btn" onClick={downloadReplay} style={{ background: "#4f46e5", color: "white", border: "none", padding: '10px 20px' }}>
                📥 Save Match Replay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Arena;
