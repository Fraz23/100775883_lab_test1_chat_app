const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("./models/User");
const GroupMessage = require("./models/GroupMessage");
const PrivateMessage = require("./models/PrivateMessage");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/chat_app_lab";

const rooms = [
  "devops",
  "cloud computing",
  "covid19",
  "sports",
  "nodeJS",
  "ai",
  "iot"
];

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/public", express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.redirect("/login");
});

app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "view", "signup.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "view", "login.html"));
});

app.get("/chat", (req, res) => {
  res.sendFile(path.join(__dirname, "view", "chat.html"));
});

app.get("/api/rooms", (req, res) => {
  res.json({ rooms });
});

app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find({}, { username: 1, _id: 0 }).sort({ username: 1 });
    res.json({ users: users.map((u) => u.username) });
  } catch (err) {
    res.status(500).json({ error: "Failed to load users" });
  }
});

app.get("/api/group-messages", async (req, res) => {
  const room = req.query.room;
  if (!room) {
    return res.status(400).json({ error: "Room is required" });
  }

  try {
    const messages = await GroupMessage.find({ room })
      .sort({ date_sent: -1 })
      .limit(50);
    res.json({ messages: messages.reverse() });
  } catch (err) {
    res.status(500).json({ error: "Failed to load messages" });
  }
});

app.get("/api/private-messages", async (req, res) => {
  const { user1, user2 } = req.query;
  if (!user1 || !user2) {
    return res.status(400).json({ error: "user1 and user2 are required" });
  }

  try {
    const messages = await PrivateMessage.find({
      $or: [
        { from_user: user1, to_user: user2 },
        { from_user: user2, to_user: user1 }
      ]
    })
      .sort({ date_sent: -1 })
      .limit(50);
    res.json({ messages: messages.reverse() });
  } catch (err) {
    res.status(500).json({ error: "Failed to load private messages" });
  }
});

app.post("/api/signup", async (req, res) => {
  const { username, firstname, lastname, password } = req.body;

  if (!username || !firstname || !lastname || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ error: "Username already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      firstname,
      lastname,
      password: hashed,
      createon: formatDate(new Date())
    });
    await user.save();

    res.json({ success: true, user: { username, firstname, lastname } });
  } catch (err) {
    res.status(500).json({ error: "Signup failed" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    res.json({
      success: true,
      user: { username: user.username, firstname: user.firstname, lastname: user.lastname }
    });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

const onlineUsers = new Map();

io.on("connection", (socket) => {
  socket.on("register", (username) => {
    if (username) {
      onlineUsers.set(username, socket.id);
      socket.data.username = username;
    }
  });

  socket.on("joinRoom", async ({ room, username }) => {
    if (!room || !username) {
      return;
    }

    socket.join(room);
    const history = await GroupMessage.find({ room })
      .sort({ date_sent: -1 })
      .limit(50);
    socket.emit("roomHistory", history.reverse());
    socket.to(room).emit("system", `${username} joined ${room}`);
  });

  socket.on("leaveRoom", ({ room, username }) => {
    if (!room) {
      return;
    }

    socket.leave(room);
    if (username) {
      socket.to(room).emit("system", `${username} left ${room}`);
    }
  });

  socket.on("chatMessage", async ({ room, from_user, message }) => {
    if (!room || !from_user || !message) {
      return;
    }

    const payload = {
      from_user,
      room,
      message,
      date_sent: formatDate(new Date())
    };

    try {
      await new GroupMessage(payload).save();
    } catch (err) {
      // Ignore save errors for realtime delivery
    }

    io.to(room).emit("chatMessage", payload);
  });

  socket.on("privateMessage", async ({ from_user, to_user, message }) => {
    if (!from_user || !to_user || !message) {
      return;
    }

    const payload = {
      from_user,
      to_user,
      message,
      date_sent: formatDate(new Date())
    };

    try {
      await new PrivateMessage(payload).save();
    } catch (err) {
      // Ignore save errors for realtime delivery
    }

    const targetSocket = onlineUsers.get(to_user);
    if (targetSocket) {
      io.to(targetSocket).emit("privateMessage", payload);
    }

    socket.emit("privateMessage", payload);
  });

  socket.on("typing", ({ room, from_user, to_user, scope }) => {
    if (!from_user || !scope) {
      return;
    }

    if (scope === "group" && room) {
      socket.to(room).emit("typing", { from_user, scope });
    }

    if (scope === "private" && to_user) {
      const targetSocket = onlineUsers.get(to_user);
      if (targetSocket) {
        io.to(targetSocket).emit("typing", { from_user, scope });
      }
    }
  });

  socket.on("stopTyping", ({ room, from_user, to_user, scope }) => {
    if (!from_user || !scope) {
      return;
    }

    if (scope === "group" && room) {
      socket.to(room).emit("stopTyping", { from_user, scope });
    }

    if (scope === "private" && to_user) {
      const targetSocket = onlineUsers.get(to_user);
      if (targetSocket) {
        io.to(targetSocket).emit("stopTyping", { from_user, scope });
      }
    }
  });

  socket.on("disconnect", () => {
    const username = socket.data.username;
    if (username) {
      onlineUsers.delete(username);
    }
  });
});

function formatDate(date) {
  return date.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
  });
