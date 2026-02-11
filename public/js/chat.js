const userData = JSON.parse(localStorage.getItem("chat_user") || "null");

if (!userData) {
  window.location.href = "/login";
}

const socket = io();
let currentRoom = "";
let typingTimer = null;

$("#current-user").text(`Signed in as ${userData.username}`);

$("#logout-btn").on("click", () => {
  localStorage.removeItem("chat_user");
  window.location.href = "/login";
});

async function loadRooms() {
  const response = await fetch("/api/rooms");
  const { rooms } = await response.json();
  const select = $("#room-select");
  select.empty();
  rooms.forEach((room) => {
    select.append(`<option value="${room}">${room}</option>`);
  });
}

async function loadUsers() {
  const response = await fetch("/api/users");
  const { users } = await response.json();
  const select = $("#private-select");
  select.find("option:not(:first)").remove();
  users
    .filter((name) => name !== userData.username)
    .forEach((name) => {
      select.append(`<option value="${name}">${name}</option>`);
    });
}

function appendMessage(message, isMe) {
  const wrapper = $("<div class='chat-message'></div>");
  if (isMe) {
    wrapper.addClass("me");
  }
  wrapper.append(`<div>${message.message}</div>`);
  wrapper.append(
    `<div class='chat-meta'>${message.from_user} • ${message.date_sent}</div>`
  );
  $("#chat-messages").append(wrapper);
  $("#chat-messages").scrollTop($("#chat-messages")[0].scrollHeight);
}

function appendSystem(text) {
  $("#chat-messages").append(`<div class='system-message'>${text}</div>`);
  $("#chat-messages").scrollTop($("#chat-messages")[0].scrollHeight);
}

$("#join-room").on("click", () => {
  const room = $("#room-select").val();
  if (!room) {
    return;
  }

  if (currentRoom) {
    socket.emit("leaveRoom", { room: currentRoom, username: userData.username });
  }

  currentRoom = room;
  $("#room-title").text(`Room: ${room}`);
  $("#chat-messages").empty();
  socket.emit("joinRoom", { room, username: userData.username });
});

$("#leave-room").on("click", () => {
  if (!currentRoom) {
    return;
  }
  socket.emit("leaveRoom", { room: currentRoom, username: userData.username });
  appendSystem(`You left ${currentRoom}`);
  currentRoom = "";
  $("#room-title").text("Choose a room");
});

$("#chat-form").on("submit", (event) => {
  event.preventDefault();
  const message = $("#message-input").val().trim();
  if (!message) {
    return;
  }

  const privateTarget = $("#private-select").val();
  if (privateTarget) {
    socket.emit("privateMessage", {
      from_user: userData.username,
      to_user: privateTarget,
      message
    });
  } else if (currentRoom) {
    socket.emit("chatMessage", {
      room: currentRoom,
      from_user: userData.username,
      message
    });
  } else {
    appendSystem("Join a room before sending group messages.");
  }

  $("#message-input").val("");
  socket.emit("stopTyping", {
    room: currentRoom,
    from_user: userData.username,
    to_user: privateTarget,
    scope: privateTarget ? "private" : "group"
  });
});

$("#message-input").on("input", () => {
  const privateTarget = $("#private-select").val();
  if (!currentRoom && !privateTarget) {
    return;
  }

  socket.emit("typing", {
    room: currentRoom,
    from_user: userData.username,
    to_user: privateTarget,
    scope: privateTarget ? "private" : "group"
  });

  if (typingTimer) {
    clearTimeout(typingTimer);
  }

  typingTimer = setTimeout(() => {
    socket.emit("stopTyping", {
      room: currentRoom,
      from_user: userData.username,
      to_user: privateTarget,
      scope: privateTarget ? "private" : "group"
    });
  }, 1000);
});

$("#load-private").on("click", async () => {
  const privateTarget = $("#private-select").val();
  if (!privateTarget) {
    appendSystem("Select a user to load private messages.");
    return;
  }

  const response = await fetch(
    `/api/private-messages?user1=${encodeURIComponent(
      userData.username
    )}&user2=${encodeURIComponent(privateTarget)}`
  );
  const { messages } = await response.json();
  $("#chat-messages").empty();
  $("#room-title").text(`Private chat with ${privateTarget}`);
  messages.forEach((msg) => appendMessage(msg, msg.from_user === userData.username));
});

socket.on("roomHistory", (messages) => {
  $("#chat-messages").empty();
  messages.forEach((msg) => appendMessage(msg, msg.from_user === userData.username));
});

socket.on("chatMessage", (payload) => {
  appendMessage(payload, payload.from_user === userData.username);
});

socket.on("privateMessage", (payload) => {
  const privateTarget = $("#private-select").val();
  if (privateTarget && payload.from_user !== privateTarget && payload.to_user !== privateTarget) {
    return;
  }
  appendMessage(payload, payload.from_user === userData.username);
});

socket.on("system", (text) => {
  appendSystem(text);
});

socket.on("typing", ({ from_user }) => {
  $("#typing-indicator").text(`${from_user} is typing...`);
});

socket.on("stopTyping", () => {
  $("#typing-indicator").text("");
});

socket.emit("register", userData.username);
loadRooms();
loadUsers();
