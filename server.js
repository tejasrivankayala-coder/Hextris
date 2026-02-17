const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Serve static game files
app.use(express.static(path.join(__dirname)));

// Room storage
const rooms = {}; // { roomCode: { host: socketId, players: [{id, name, index}], started: false } }

io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);

  // Create a room
  socket.on('createRoom', ({ name, roomCode }) => {
    if (rooms[roomCode]) {
      socket.emit('error', { message: 'Room already exists. Try again.' });
      return;
    }
    rooms[roomCode] = {
      host: socket.id,
      players: [{ id: socket.id, name: name, index: 0 }],
      started: false
    };
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerIndex = 0;
    console.log(`[Room] ${name} created room ${roomCode}`);
    socket.emit('roomCreated', { roomCode });
  });

  // Join a room
  socket.on('joinRoom', ({ name, roomCode }) => {
    const room = rooms[roomCode];
    if (!room) {
      socket.emit('error', { message: 'Room not found. Check the code.' });
      return;
    }
    if (room.players.length >= 3) {
      socket.emit('error', { message: 'Room is full (3/3 players).' });
      return;
    }
    if (room.started) {
      socket.emit('error', { message: 'Game already started.' });
      return;
    }

    const playerIndex = room.players.length; // 1 or 2
    room.players.push({ id: socket.id, name: name, index: playerIndex });
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerIndex = playerIndex;

    console.log(`[Room] ${name} joined room ${roomCode} as P${playerIndex + 1}`);

    // Tell the guest their info
    socket.emit('joined', {
      playerIndex: playerIndex,
      hostName: room.players[0].name,
      players: room.players.map(p => p.name)
    });

    // Tell everyone (especially host) that a new player joined
    io.to(roomCode).emit('playerJoined', {
      players: room.players.map(p => p.name),
      playerCount: room.players.length
    });
  });

  // Host starts the match
  socket.on('startMatch', () => {
    const roomCode = socket.roomCode;
    const room = rooms[roomCode];
    if (!room || socket.id !== room.host) return;
    if (room.players.length < 2) return;

    room.started = true;
    const names = room.players.map(p => p.name);
    // Generate a shared seed so all players get the same block sequence
    const sharedSeed = Math.floor(Math.random() * 2147483647);
    console.log(`[Game] Match started in room ${roomCode} with ${names.length} players, seed: ${sharedSeed}`);

    io.to(roomCode).emit('matchStart', {
      names: names,
      playerCount: names.length,
      seed: sharedSeed
    });
  });

  // Power-up used by a player (relay to all others)
  socket.on('mpPower', (data) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;

    console.log(`[Power] P${socket.playerIndex + 1} used ${data.type} in room ${roomCode}`);
    socket.to(roomCode).emit('mpPower', {
      playerIndex: socket.playerIndex,
      type: data.type
    });
  });

  // Player sends their game sync data
  socket.on('mpSync', (data) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;

    // Relay to all other players in the room
    socket.to(roomCode).emit('mpSync', {
      playerIndex: socket.playerIndex,
      score: data.score,
      lives: data.lives,
      dead: data.dead
    });
  });

  // Host sends full sync (timer, all players' data)
  socket.on('mpSyncAll', (data) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;

    socket.to(roomCode).emit('mpSyncAll', data);
  });

  // Game over signal
  socket.on('gameOver', (data) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;

    io.to(roomCode).emit('gameOver', data);
  });

  // Time up signal
  socket.on('mpTimeUp', (data) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;

    io.to(roomCode).emit('mpTimeUp', data);
  });

  // Restart match
  socket.on('mpRestart', () => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;

    io.to(roomCode).emit('mpRestart');
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log(`[-] Player disconnected: ${socket.id}`);
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;

    const room = rooms[roomCode];
    const playerIndex = room.players.findIndex(p => p.id === socket.id);

    if (playerIndex === -1) return;

    if (socket.id === room.host) {
      // Host left — end game for everyone
      console.log(`[Room] Host left room ${roomCode}, closing room`);
      io.to(roomCode).emit('hostDisconnected');
      // Clean up all sockets from room
      const sockets = io.sockets.adapter.rooms.get(roomCode);
      if (sockets) {
        sockets.forEach(sid => {
          const s = io.sockets.sockets.get(sid);
          if (s) {
            s.leave(roomCode);
            s.roomCode = null;
          }
        });
      }
      delete rooms[roomCode];
    } else {
      // Guest left
      console.log(`[Room] P${playerIndex + 1} left room ${roomCode}`);
      io.to(roomCode).emit('playerDisconnected', { playerIndex: playerIndex });

      if (!room.started) {
        // Remove from player list if game hasn't started
        room.players.splice(playerIndex, 1);
        // Reassign indices
        room.players.forEach((p, i) => {
          p.index = i;
          const s = io.sockets.sockets.get(p.id);
          if (s) s.playerIndex = i;
        });
        io.to(roomCode).emit('playerJoined', {
          players: room.players.map(p => p.name),
          playerCount: room.players.length
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎮 Hextris Server running on http://localhost:${PORT}`);
  console.log(`📡 Share this URL with players on different systems!`);
  console.log(`\nTo make it accessible over the internet, run:`);
  console.log(`   npx localtunnel --port ${PORT}\n`);
});
