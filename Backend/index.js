const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { VM } = require("vm2");
require("dotenv").config();
const connectDB = require("./config/db");
const authRoutes = require('./routes/authRoutes');

// Connect to Database
connectDB();

const app = express();

// Dynamic localhost origin resolver for CORS
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
};

app.use(cors(corsOptions));

// Body parser middleware (should be before routes)
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"]
  }
});

// ---------------- LOBBIES & ONLINE USERS & GAMES ----------------
const lobbies = {};
const onlinePlayers = {}; // socket.id -> { socketId, username }
const games = {};         // lobbyId -> game object

// ---------------- HELPERS ----------------
const generateLobbyId = () =>
  "LOBBY-" + Math.random().toString(36).substring(2, 7).toUpperCase();

// Helper to broadcast online players list to all connected clients
const broadcastOnlinePlayers = () => {
  io.emit("onlinePlayersUpdate", Object.values(onlinePlayers));
};

// Spawn Orbs Helper (number of orbs > number of players, e.g., N+1 to N+4)
const spawnOrbs = (playerCount) => {
  const orbs = [];
  const orbCount = Math.floor(Math.random() * 4) + playerCount + 1; // Between N+1 and N+4
  for (let i = 0; i < orbCount; i++) {
    orbs.push({
      id: "orb-" + i + "-" + Math.random().toString(36).substring(2, 5),
      x: Math.random() * 500 + 50,
      y: Math.random() * 500 + 50
    });
  }
  return orbs;
};

// Simple rules-based generator for AI Post-Match Analysis
const generateAIAnalysis = (players) => {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const runnerUp = sorted[1] || { username: "None" };

  const templates = [
    `Analyzing Match Performance: **${winner.username}** secured victory with a total of **${winner.score}** points. Their bot demonstrated exceptional adaptivity, keeping movement profiles dynamic inside the arena.`,
    `Strategy Evaluation: **${winner.username}** dominated the arena. **${runnerUp.username}** struggled with safe zone containment, accumulating excessive poison ticks outside the boundary.`,
    `Technical Audit: Winner **${winner.username}** optimized their sandbox execution time (average <5ms). Collision mechanics showed high-precision pathing. Recommend **${runnerUp.username}** to refactor scan triggers to avoid execution limits.`
  ];
  return templates[Math.floor(Math.random() * templates.length)];
};

// ---------------- SOCKET ----------------
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // ✅ REGISTER USER ONLINE
  socket.on("registerUser", ({ username }) => {
    if (!username) return;
    onlinePlayers[socket.id] = { socketId: socket.id, username };
    console.log(`Registered user: ${username} (${socket.id})`);
    broadcastOnlinePlayers();
  });

  // ✅ CREATE LOBBY
  socket.on("createLobby", ({ name }, callback) => {
    const lobbyId = generateLobbyId();

    lobbies[lobbyId] = {
      host: socket.id,
      hostUsername: name,
      players: [
        { socketId: socket.id, username: name }
      ],
      requests: []
    };

    socket.join(lobbyId);
    socket.lobbyId = lobbyId;

    io.to(lobbyId).emit("lobbyUpdate", lobbies[lobbyId].players);
    broadcastOnlinePlayers();

    callback?.({
      success: true,
      lobbyId
    });
  });

  // ✅ JOIN REQUEST (PLAYER)
  socket.on("joinRequest", ({ lobbyId, name }) => {
    if (!lobbyId || !name) return;
    const cleanLobbyId = lobbyId.trim().toUpperCase();
    const cleanName = name.trim();
    
    console.log(`[Socket] Received joinRequest from "${cleanName}" for lobby "${cleanLobbyId}"`);
    const lobby = lobbies[cleanLobbyId];
    if (!lobby) {
      console.log(`[Socket] Lobby "${cleanLobbyId}" not found for joinRequest`);
      socket.emit("joinRequestError", { message: "Lobby not found." });
      return;
    }

    // Check if player is already in lobby (case-insensitive)
    if (lobby.players.some(p => p.username.trim().toLowerCase() === cleanName.toLowerCase())) {
      console.log(`[Socket] Player "${cleanName}" already in lobby "${cleanLobbyId}". Navigating them.`);
      socket.emit("requestAccepted", { lobbyId: cleanLobbyId });
      return;
    }

    // Check if already requested (case-insensitive)
    if (lobby.requests.some(r => r.name.trim().toLowerCase() === cleanName.toLowerCase())) {
      console.log(`[Socket] Player "${cleanName}" has already requested to join lobby "${cleanLobbyId}"`);
      return;
    }

    const request = {
      socketId: socket.id,
      name: cleanName
    };

    lobby.requests.push(request);
    console.log(`[Socket] Added join request from "${cleanName}" to lobby "${cleanLobbyId}". Total requests: ${lobby.requests.length}`);

    // Notify host via room broadcast
    io.to(cleanLobbyId).emit("newRequest", request);
    io.to(cleanLobbyId).emit("requestUpdate", lobby.requests);
  });

  // ✅ HOST / VIEWER JOIN LOBBY PAGE
  socket.on("joinLobbyAsViewer", ({ lobbyId, username }) => {
    if (!lobbyId || !username) return;
    const cleanLobbyId = lobbyId.trim().toUpperCase();
    const cleanUsername = username.trim();
    
    console.log(`[Socket] joinLobbyAsViewer triggered by "${cleanUsername}" for lobby "${cleanLobbyId}"`);
    const lobby = lobbies[cleanLobbyId];
    if (!lobby) {
      console.log(`[Socket] Lobby "${cleanLobbyId}" not found for joinLobbyAsViewer`);
      return;
    }

    socket.join(cleanLobbyId);

    // If host is joining/reconnecting (case-insensitive), update host socket.id
    if (lobby.hostUsername.trim().toLowerCase() === cleanUsername.toLowerCase()) {
      lobby.host = socket.id;
      console.log(`[Socket] Host "${cleanUsername}" reconnected/joined lobby "${cleanLobbyId}" with socket ID: ${socket.id}`);
    }

    socket.emit("lobbyDetails", { hostUsername: lobby.hostUsername, hostSocketId: lobby.host });
    socket.emit("lobbyUpdate", lobby.players);

    // Host receives requests list and online players (case-insensitive check)
    if (lobby.host === socket.id || lobby.hostUsername.trim().toLowerCase() === cleanUsername.toLowerCase()) {
      socket.emit("requestUpdate", lobby.requests);
      socket.emit("onlinePlayersUpdate", Object.values(onlinePlayers));
      console.log(`[Socket] Sent requests (${lobby.requests.length}) and online players (${Object.keys(onlinePlayers).length}) to host "${cleanUsername}"`);
    }
  });

  // ✅ ACCEPT REQUEST
  socket.on("acceptRequest", ({ lobbyId, socketId }) => {
    if (!lobbyId) return;
    const cleanLobbyId = lobbyId.trim().toUpperCase();
    const lobby = lobbies[cleanLobbyId];
    if (!lobby) return;

    const userIndex = lobby.requests.findIndex(r => r.socketId === socketId);
    if (userIndex === -1) return;

    const user = lobby.requests[userIndex];
    lobby.players.push({ socketId: user.socketId, username: user.name });
    lobby.requests.splice(userIndex, 1);

    const targetSocket = io.sockets.sockets.get(socketId);
    if (targetSocket) {
      targetSocket.join(cleanLobbyId);
    }

    // Notify joining user to navigate
    io.to(socketId).emit("requestAccepted", { lobbyId: cleanLobbyId });

    io.to(cleanLobbyId).emit("lobbyUpdate", lobby.players);
    io.to(cleanLobbyId).emit("requestUpdate", lobby.requests);
    console.log(`[Socket] Host accepted join request from "${user.name}" for lobby "${cleanLobbyId}"`);
  });

  // ✅ REJECT REQUEST
  socket.on("rejectRequest", ({ lobbyId, socketId }) => {
    if (!lobbyId) return;
    const cleanLobbyId = lobbyId.trim().toUpperCase();
    const lobby = lobbies[cleanLobbyId];
    if (!lobby) return;

    lobby.requests = lobby.requests.filter(r => r.socketId !== socketId);

    io.to(socketId).emit("requestRejected", { lobbyId: cleanLobbyId });
    io.to(cleanLobbyId).emit("requestUpdate", lobby.requests);
    console.log(`[Socket] Host rejected join request for socket ID: ${socketId} in lobby "${cleanLobbyId}"`);
  });

  // ✅ ADD PLAYER DIRECTLY (HOST ACTION)
  socket.on("addPlayerToLobby", ({ lobbyId, socketId }) => {
    if (!lobbyId) return;
    const cleanLobbyId = lobbyId.trim().toUpperCase();
    const lobby = lobbies[cleanLobbyId];
    if (!lobby) return;

    // Verify requester is host
    if (lobby.host !== socket.id) return;

    const onlinePlayer = onlinePlayers[socketId];
    if (!onlinePlayer) return;

    // Check if player is already in lobby (case-insensitive)
    if (lobby.players.some(p => p.username.trim().toLowerCase() === onlinePlayer.username.trim().toLowerCase())) {
      return;
    }

    // Add to players list
    lobby.players.push({ socketId: onlinePlayer.socketId, username: onlinePlayer.username });

    // Clean up request if any
    lobby.requests = lobby.requests.filter(r => r.socketId !== socketId);

    const targetSocket = io.sockets.sockets.get(socketId);
    if (targetSocket) {
      targetSocket.join(cleanLobbyId);
    }

    // Notify player to navigate
    io.to(socketId).emit("addedToLobby", { lobbyId: cleanLobbyId });

    io.to(cleanLobbyId).emit("lobbyUpdate", lobby.players);
    io.to(cleanLobbyId).emit("requestUpdate", lobby.requests);
    console.log(`[Socket] Host directly added player "${onlinePlayer.username}" to lobby "${cleanLobbyId}"`);
  });

  // ✅ START GAME (HOST ACTION)
  socket.on("startGame", ({ lobbyId }) => {
    if (!lobbyId) return;
    const cleanLobbyId = lobbyId.trim().toUpperCase();
    const lobby = lobbies[cleanLobbyId];
    if (!lobby) return;

    // Verify host
    if (lobby.host !== socket.id) return;

    // Setup Game State
    games[lobbyId] = {
      lobbyId,
      players: lobby.players.map((p, idx) => ({
        socketId: p.socketId,
        username: p.username,
        x: Math.random() * 400 + 100,
        y: Math.random() * 400 + 100,
        vx: 0,
        vy: 0,
        prevX: 0,
        prevY: 0,
        health: 100,
        score: 0,
        isAlive: true,
        code: `// Write your bot logic here\n// Use: move("right"), move("left"), move("up"), move("down"), scan()\nmove("right");`,
        scanCount: 2,
        lastScanTick: 0,
        scanActiveUntil: 0,
        inShrinkingZoneSeconds: 0,
        direction: "right",
        error: null
      })),
      orbs: spawnOrbs(lobby.players.length),
      round: 1,
      roundTimer: 450, // 45 seconds (450 * 100ms)
      tick: 0,
      safeZone: { x: 300, y: 300, r: 350 },
      controlPoint: { x: 250, y: 250, w: 100, h: 100 },
      obstacles: [
        { x: 150, y: 150, w: 40, h: 40 },
        { x: 410, y: 150, w: 40, h: 40 },
        { x: 150, y: 410, w: 40, h: 40 },
        { x: 410, y: 410, w: 40, h: 40 }
      ],
      history: [],
      gameState: "active"
    };

    // Emit event to start rendering game client-side
    io.to(lobbyId).emit("gameStart", { lobbyId });

    const game = games[lobbyId];

    // Start 100ms Game Loop
    game.intervalId = setInterval(() => {
      game.roundTimer--;

      // Round Transitions
      if (game.roundTimer <= 0) {
        if (game.round < 5) {
          game.round++;
          game.roundTimer = 450;
          
          // Reset players for new round
          game.players.forEach(p => {
            p.x = Math.random() * 400 + 100;
            p.y = Math.random() * 400 + 100;
            p.health = 100;
            p.isAlive = true;
            p.inShrinkingZoneSeconds = 0;
            p.scanCount = 2;
            p.error = null;
          });

          // Reset parameters
          game.safeZone = { x: 300, y: 300, r: 350 };
          game.orbs = spawnOrbs(game.players.length);
          io.to(lobbyId).emit("roundCompleted", { round: game.round - 1, nextRound: game.round });
        } else {
          // Game Completed
          clearInterval(game.intervalId);
          const sorted = [...game.players].sort((a, b) => b.score - a.score);
          const analysis = generateAIAnalysis(game.players);
          
          // surivival calculation
          const scoreboardData = sorted.map((p, idx) => ({
            rank: idx + 1,
            username: p.username,
            score: p.score,
            health: p.health,
            survivedTicks: p.isAlive ? game.tick : (p.deathTick || game.tick)
          }));

          io.to(lobbyId).emit("gameFinished", {
            scoreboard: scoreboardData,
            analysis,
            history: game.history
          });

          delete games[lobbyId];
          return;
        }
      }

      // Safe Zone shrinking (Rounds 2, 5)
      if (game.round === 2 || game.round === 5) {
        game.safeZone.r = Math.max(15, game.safeZone.r - 0.75); // Shrink slowly
      }

      // Execute Code for each player
      game.players.forEach(p => {
        if (!p.isAlive) return;

        // Populate other visible players based on Fog of War (Round 4, 5)
        let visiblePlayers = game.players
          .filter(op => op.socketId !== p.socketId && op.isAlive)
          .map(op => ({ username: op.username, x: op.x, y: op.y }));

        const isFogOfWar = (game.round === 4 || game.round === 5);
        const scanActive = game.tick < p.scanActiveUntil;

        if (isFogOfWar && !scanActive) {
          // Filter players only within 150px range
          visiblePlayers = visiblePlayers.filter(op => {
            const dist = Math.hypot(op.x - p.x, op.y - p.y);
            return dist <= 150;
          });
        }

        const sandbox = {
          x: p.x,
          y: p.y,
          health: p.health,
          score: p.score,
          orbs: game.orbs.map(o => ({ x: o.x, y: o.y })),
          otherPlayers: visiblePlayers,
          safeZone: { ...game.safeZone },
          controlPoint: { ...game.controlPoint },
          round: game.round,
          scanCount: p.scanCount,
          direction: p.direction,
          move: (dir) => {
            if (["left", "right", "up", "down"].includes(dir)) {
              sandbox.direction = dir;
            }
          },
          scan: () => {
            sandbox.triggeredScan = true;
          }
        };

        // Secure Sandbox Execution using VM2
        try {
          p.error = null;
          const vm2Instance = new VM({
            timeout: 30, // 30ms limit for infinite loops
            sandbox: sandbox
          });
          vm2Instance.run(p.code);
          p.direction = sandbox.direction;

          // Perform Scan if requested
          if (sandbox.triggeredScan && p.scanCount > 0 && (game.tick - p.lastScanTick) > 30) {
            p.scanCount--;
            p.lastScanTick = game.tick;
            p.scanActiveUntil = game.tick + 15; // Scan lasts 1.5 seconds (15 ticks)
          }
        } catch (err) {
          p.error = err.message || "Code timeout/crashed";
        }

        // Apply movement physics
        // Bots continue moving in their direction unless new command sets it differently
        if (p.direction === "left") { p.vx = -4.5; p.vy = 0; }
        else if (p.direction === "right") { p.vx = 4.5; p.vy = 0; }
        else if (p.direction === "up") { p.vx = 0; p.vy = -4.5; }
        else if (p.direction === "down") { p.vx = 0; p.vy = 4.5; }

        p.prevX = p.x;
        p.prevY = p.y;
        
        let nextX = Math.max(10, Math.min(590, p.x + p.vx));
        let nextY = Math.max(10, Math.min(590, p.y + p.vy));

        // Obstacles collision detection
        let collides = false;
        const radius = 16;
        for (const obs of game.obstacles) {
          const closestX = Math.max(obs.x, Math.min(nextX, obs.x + obs.w));
          const closestY = Math.max(obs.y, Math.min(nextY, obs.y + obs.h));
          const distX = nextX - closestX;
          const distY = nextY - closestY;
          const distance = Math.hypot(distX, distY);
          if (distance < radius) {
            collides = true;
            break;
          }
        }

        if (!collides) {
          p.x = nextX;
          p.y = nextY;
        } else {
          p.vx = 0;
          p.vy = 0;
        }

        // Damage calculation outside Safe Zone (Rounds 2, 5)
        if (game.round === 2 || game.round === 5) {
          const distToCenter = Math.hypot(p.x - game.safeZone.x, p.y - game.safeZone.y);
          if (distToCenter > game.safeZone.r) {
            if (game.tick % 10 === 0) { // Every second
              p.inShrinkingZoneSeconds++;
              const damage = 10 * Math.pow(2, p.inShrinkingZoneSeconds - 1);
              p.health = Math.max(0, p.health - damage);
              if (p.health <= 0) {
                p.isAlive = false;
                p.deathTick = game.tick;
              }
            }
          } else {
            p.inShrinkingZoneSeconds = 0;
          }
        }

        // King of the Hill objective (Rounds 3, 5)
        if (game.round === 3 || game.round === 5) {
          const inHill = (
            p.x >= game.controlPoint.x &&
            p.x <= game.controlPoint.x + game.controlPoint.w &&
            p.y >= game.controlPoint.y &&
            p.y <= game.controlPoint.y + game.controlPoint.h
          );
          if (inHill) {
            // Cannot stop! Must change position continuously
            const isMoving = (Math.abs(p.x - p.prevX) > 0.1 || Math.abs(p.y - p.prevY) > 0.1);
            if (isMoving) {
              p.score += 1; // +1 point per tick
            }
          }
        }
      });

      // Orb Collection Collisions (Rounds 1, 5)
      if (game.round === 1 || game.round === 5) {
        game.orbs = game.orbs.filter(orb => {
          let collected = false;
          game.players.forEach(p => {
            if (!p.isAlive) return;
            const dist = Math.hypot(p.x - orb.x, p.y - orb.y);
            if (dist < 15) {
              p.score += 10; // +10 score for energy orb
              collected = true;
              io.to(lobbyId).emit("orbCollected", { username: p.username, x: orb.x, y: orb.y });
            }
          });
          return !collected;
        });

        // Respawn if all orbs collected
        if (game.orbs.length === 0) {
          game.orbs = spawnOrbs(game.players.length);
        }
      }

      game.tick++;

      // Broadcast state to all players
      io.to(lobbyId).emit("gameStateUpdate", {
        players: game.players.map(p => ({
          socketId: p.socketId,
          username: p.username,
          x: p.x,
          y: p.y,
          health: p.health,
          score: p.score,
          isAlive: p.isAlive,
          scanCount: p.scanCount,
          scanActive: game.tick < p.scanActiveUntil,
          error: p.error,
          direction: p.direction
        })),
        orbs: game.orbs,
        safeZone: game.safeZone,
        controlPoint: game.controlPoint,
        round: game.round,
        roundTimer: Math.max(0, Math.ceil(game.roundTimer / 10)),
        tick: game.tick,
        obstacles: game.obstacles
      });

      // Record tick history
      game.history.push({
        tick: game.tick,
        round: game.round,
        players: game.players.map(p => ({
          username: p.username,
          x: p.x,
          y: p.y,
          direction: p.direction,
          health: p.health,
          score: p.score,
          isAlive: p.isAlive
        })),
        orbs: [...game.orbs],
        safeZone: { ...game.safeZone },
        controlPoint: { ...game.controlPoint }
      });
    }, 100);
  });

  // ✅ SUBMIT CODE
  socket.on("submitCode", ({ lobbyId, code }) => {
    if (!lobbyId) return;
    const cleanLobbyId = lobbyId.trim().toUpperCase();
    const game = games[cleanLobbyId];
    if (!game) return;
    const player = game.players.find(p => p.socketId === socket.id);
    if (player) {
      player.code = code;
      console.log(`Updated bot code for: ${player.username}`);
    }
  });

  // ✅ MANUAL MOUSE MOVE OVERRIDE
  socket.on("manualMove", ({ lobbyId, direction }) => {
    if (!lobbyId) return;
    const cleanLobbyId = lobbyId.trim().toUpperCase();
    const game = games[cleanLobbyId];
    if (!game) return;
    const player = game.players.find(p => p.socketId === socket.id);
    if (player && player.isAlive && ["left", "right", "up", "down"].includes(direction)) {
      player.direction = direction;
    }
  });

  // ✅ REMOVE PLAYER FROM LOBBY (KICK)
  socket.on("removePlayerFromLobby", ({ lobbyId, socketId }) => {
    if (!lobbyId || !socketId) return;
    const cleanLobbyId = lobbyId.trim().toUpperCase();
    const lobby = lobbies[cleanLobbyId];
    if (lobby) {
      // Security check: Only the host can kick players
      if (lobby.host !== socket.id) {
        console.log(`[Socket] Unauthorized removePlayerFromLobby attempt by ${socket.id}`);
        return;
      }

      // Find the player in lobby
      const pIdx = lobby.players.findIndex(p => p.socketId === socketId);
      if (pIdx !== -1) {
        const removedPlayer = lobby.players[pIdx];
        lobby.players.splice(pIdx, 1);
        console.log(`[Socket] Host removed player "${removedPlayer.username}" from lobby "${cleanLobbyId}"`);
        
        // Notify the removed player
        io.to(socketId).emit("kickedFromLobby");

        // Notify remaining lobby members
        io.to(cleanLobbyId).emit("lobbyUpdate", lobby.players);
        io.to(cleanLobbyId).emit("onlinePlayersUpdate", Object.values(onlinePlayers));
      }
    }
  });

  // ✅ LEAVE LOBBY / QUIT MATCH
  socket.on("leaveLobby", ({ lobbyId }) => {
    if (!lobbyId) return;
    const cleanLobbyId = lobbyId.trim().toUpperCase();
    console.log(`[Socket] Player "${socket.id}" requested to leave lobby "${cleanLobbyId}"`);
    socket.leave(cleanLobbyId);

    const lobby = lobbies[cleanLobbyId];
    if (lobby) {
      const wasHost = (lobby.host === socket.id);
      lobby.players = lobby.players.filter(p => p.socketId !== socket.id);
      lobby.requests = lobby.requests.filter(r => r.socketId !== socket.id);

      // If host left, assign next player as host
      if (wasHost && lobby.players.length > 0) {
        lobby.host = lobby.players[0].socketId;
        lobby.hostUsername = lobby.players[0].username;
        io.to(cleanLobbyId).emit("lobbyDetails", { hostUsername: lobby.hostUsername, hostSocketId: lobby.host });
      }

      io.to(cleanLobbyId).emit("lobbyUpdate", lobby.players);

      if (lobby.players.length > 0) {
        io.to(cleanLobbyId).emit("requestUpdate", lobby.requests);
        io.to(cleanLobbyId).emit("onlinePlayersUpdate", Object.values(onlinePlayers));
      } else {
        console.log(`[Socket] Lobby "${cleanLobbyId}" is empty. Deleting it.`);
        delete lobbies[cleanLobbyId];
        if (games[cleanLobbyId]) {
          clearInterval(games[cleanLobbyId].intervalId);
          delete games[cleanLobbyId];
        }
      }
    }

    // Also mark them dead if they leave during an active game
    const game = games[cleanLobbyId];
    if (game) {
      const gp = game.players.find(p => p.socketId === socket.id);
      if (gp) {
        gp.isAlive = false;
        gp.health = 0;
        gp.deathTick = game.tick;
        console.log(`[Socket] Marked player "${gp.username}" as dead/eliminated in game "${cleanLobbyId}"`);
      }
    }
  });

  // ✅ DISCONNECT CLEANUP
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    // Remove from online players list
    delete onlinePlayers[socket.id];
    broadcastOnlinePlayers();

    for (const lobbyId in lobbies) {
      const lobby = lobbies[lobbyId];
      const wasHost = (lobby.host === socket.id);

      lobby.players = lobby.players.filter(p => p.socketId !== socket.id);
      lobby.requests = lobby.requests.filter(r => r.socketId !== socket.id);

      if (wasHost && lobby.players.length > 0) {
        lobby.host = lobby.players[0].socketId;
        lobby.hostUsername = lobby.players[0].username;
        io.to(lobbyId).emit("lobbyDetails", { hostUsername: lobby.hostUsername, hostSocketId: lobby.host });
      }

      io.to(lobbyId).emit("lobbyUpdate", lobby.players);

      if (lobby.players.length > 0) {
        io.to(lobbyId).emit("requestUpdate", lobby.requests);
        io.to(lobbyId).emit("onlinePlayersUpdate", Object.values(onlinePlayers));
      } else {
        delete lobbies[lobbyId];
        // Clean up game loop if any
        if (games[lobbyId]) {
          clearInterval(games[lobbyId].intervalId);
          delete games[lobbyId];
        }
      }
    }
  });
});

server.listen(3001, () => {
  console.log("Server running on port 3001");
});