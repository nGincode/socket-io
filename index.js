const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("🔌 Client connected:", socket.id);

  socket.onAny((event, ...args) => {
    console.log(`📨 [${socket.id}]`, event, args);
  });

  // JOIN STORE
  socket.on("join-store", (storeId) => {
    const room = `store-${String(storeId)}`;
    socket.join(room);
    console.log(`🏪 ${socket.id} joined ${room}`);
  });

  // LEAVE STORE
  socket.on("leave-store", (storeId) => {
    const room = `store-${String(storeId)}`;
    socket.leave(room);
    console.log(`🚪 ${socket.id} left ${room}`);
  });

  // 🔥 SYNC TRANSACTION
  socket.on("sync-transaction", ({ storeId, userId }) => {
    const room = `store-${String(storeId)}`;
    console.log(`🔄 sync-transaction from ${socket.id} → ${room}`);

    // broadcast ke device lain
    socket.to(room).emit("sync-transaction", { storeId, userId });
  });

  // 🔥 SYNC ITEM
  socket.on("sync-item", ({ storeId }) => {
    const room = `store-${String(storeId)}`;
    console.log(`📦 sync-item → ${room}`);

    io.to(room).emit("sync-item", { storeId });
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

const PORT = 1991;
server.listen(PORT, () => {
  console.log(`🚀 404 Not Found Claudflare ${PORT}`);
});
