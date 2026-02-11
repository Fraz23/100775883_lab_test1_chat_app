const userData = JSON.parse(localStorage.getItem("chat_user") || "null");

if (!userData) {
  window.location.href = "/login";
}

const socket = io();
let currentRoom = "";
let currentPrivate = "";
let typingTimer = null;

$("#current-user").text(`Signed in as ${userData.username}`);

const toastStack = $("#toast-stack");

function showToast(type, title, message) {
  const toast = $("<div class='toast-item'></div>");
  if (type) {
    toast.addClass(type);
  }
  toast.append(`<div class='toast-title'>${title}</div>`);
  toast.append(`<div class='toast-message'>${message}</div>`);
  toastStack.append(toast);

  setTimeout(() => {
    toast.fadeOut(200, () => toast.remove());
  }, 2600);
}

function setRoomStatus(room) {
  const banner = $("#mode-banner");
  if (room) {
    $("#status-hint").text("Room chat is active.");
    banner
      .removeClass("mode-private mode-idle")
      .addClass("mode-room")
      .text(`Mode: Room chat (${room})`);
  } else {
    $("#status-hint").text("No room selected.");
    if (!currentPrivate) {
      banner
        .removeClass("mode-room mode-private")
        .addClass("mode-idle")
        .text("Mode: idle");
    }
  }
}

function setPrivateStatus(user) {
  const banner = $("#mode-banner");
  if (user) {
    $("#status-hint").text(`Private chat with ${user}.`);
    banner
      .removeClass("mode-room mode-idle")
      .addClass("mode-private")
      .text(`Mode: Private chat (${user})`);
  } else {
    if (!currentRoom) {
      banner
        .removeClass("mode-room mode-private")
        .addClass("mode-idle")
        .text("Mode: idle");
    }
  }
}

function setSendEnabled() {
  const enabled = Boolean(currentRoom || currentPrivate);
  $("#message-input").prop("disabled", !enabled);
  $("#send-btn").prop("disabled", !enabled);
}

function renderEmptyState(text) {
  $("#chat-messages").html(`<div class='empty-state'>${text}</div>`);
}

$("#logout-btn").on("click", () => {
  localStorage.removeItem("chat_user");
  window.location.href = "/login";
});

async function loadRooms() {
  const select = $("#room-select");
  select.html("<option>Loading rooms...</option>");
  try {
    const response = await fetch("/api/rooms");
    const { rooms } = await response.json();
    select.empty();
    rooms.forEach((room) => {
      select.append(`<option value="${room}">${room}</option>`);
    });
  } catch (err) {
    select.html("<option>Failed to load rooms</option>");
    showToast("error", "Rooms", "Could not load rooms. Try refresh.");
  }
}

async function loadUsers() {
  const select = $("#private-select");
  select.find("option:not(:first)").remove();
  select.append("<option disabled>Loading users...</option>");
  try {
    const response = await fetch("/api/users");
    const { users } = await response.json();
    select.find("option:disabled").remove();
    users
      .filter((name) => name !== userData.username)
      .forEach((name) => {
        select.append(`<option value="${name}">${name}</option>`);
      });
  } catch (err) {
    select.find("option:disabled").text("Failed to load users");
    showToast("error", "Users", "Could not load users list.");
  }
}

function appendMessage(message, isMe) {
  const row = $("<div class='message-row'></div>");
  if (isMe) {
    row.addClass("me");
  }
  const bubble = $("<div class='message-bubble'></div>");
  bubble.append($("<div class='message-text'></div>").text(message.message));
  bubble.append(
    `<div class='chat-meta'>${message.from_user} • ${message.date_sent}</div>`
  );
  row.append(bubble);
  $("#chat-messages").append(row);
  $("#chat-messages").scrollTop($("#chat-messages")[0].scrollHeight);
}

function appendSystem(text) {
  $("#chat-messages").append(`<div class='system-message'>${text}</div>`);
  $("#chat-messages").scrollTop($("#chat-messages")[0].scrollHeight);
}

$("#join-room").on("click", () => {
  const room = $("#room-select").val();
  if (!room) {
    showToast("warning", "Room", "Pick a room before joining.");
    return;
  }

  if (currentPrivate) {
    currentPrivate = "";
    $("#private-select").val("");
    setPrivateStatus("");
  }

  if (currentRoom) {
    socket.emit("leaveRoom", { room: currentRoom, username: userData.username });
  }

  currentRoom = room;
  setRoomStatus(room);
  setSendEnabled();
  $("#room-title").text(`Room: ${room}`);
  $("#chat-messages").empty();
  socket.emit("joinRoom", { room, username: userData.username });
  showToast("", "Joined", `You joined ${room}.`);
});

$("#leave-room").on("click", () => {
  if (!currentRoom) {
    showToast("warning", "Room", "You are not in a room.");
    return;
  }
  socket.emit("leaveRoom", { room: currentRoom, username: userData.username });
  appendSystem(`You left ${currentRoom}`);
  currentRoom = "";
  setRoomStatus("");
  setSendEnabled();
  $("#room-title").text("Choose a room");
});

$("#private-select").on("change", async () => {
  currentPrivate = $("#private-select").val();
  setPrivateStatus(currentPrivate);
  setSendEnabled();

  if (!currentPrivate) {
    $("#room-title").text(currentRoom ? `Room: ${currentRoom}` : "Choose a room");
    renderEmptyState("Pick a room or private chat to start.");
    return;
  }

  if (currentRoom) {
    socket.emit("leaveRoom", { room: currentRoom, username: userData.username });
    currentRoom = "";
    setRoomStatus("");
  }

  try {
    renderEmptyState("Loading private history...");
    const response = await fetch(
      `/api/private-messages?user1=${encodeURIComponent(
        userData.username
      )}&user2=${encodeURIComponent(currentPrivate)}`
    );
    const { messages } = await response.json();
    $("#chat-messages").empty();
    $("#room-title").text(`Private chat with ${currentPrivate}`);
    if (!messages.length) {
      renderEmptyState("No private messages yet. Say hello!");
    } else {
      messages.forEach((msg) => appendMessage(msg, msg.from_user === userData.username));
    }
    showToast("", "Private Chat", `Switched to ${currentPrivate}.`);
  } catch (err) {
    renderEmptyState("Could not load private history.");
    showToast("error", "Private Chat", "Failed to load messages.");
  }
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
    showToast("warning", "Message", "Join a room or pick a private user.");
    return;
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
    showToast("warning", "Private Chat", "Select a user first.");
    return;
  }

  try {
    renderEmptyState("Loading private history...");
    const response = await fetch(
      `/api/private-messages?user1=${encodeURIComponent(
        userData.username
      )}&user2=${encodeURIComponent(privateTarget)}`
    );
    const { messages } = await response.json();
    $("#chat-messages").empty();
    $("#room-title").text(`Private chat with ${privateTarget}`);
    if (!messages.length) {
      renderEmptyState("No private messages yet. Say hello!");
    } else {
      messages.forEach((msg) => appendMessage(msg, msg.from_user === userData.username));
    }
    showToast("", "Private Chat", `Loaded history with ${privateTarget}.`);
  } catch (err) {
    renderEmptyState("Could not load private history.");
    showToast("error", "Private Chat", "Failed to load messages.");
  }
});

socket.on("roomHistory", (messages) => {
  $("#chat-messages").empty();
  if (!messages.length) {
    renderEmptyState("No messages here yet. Start the conversation!");
    return;
  }
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
setRoomStatus("");
setPrivateStatus("");
setSendEnabled();
renderEmptyState("Pick a room or private chat to start.");
showToast("", "Welcome", "You are signed in and ready to chat.");
loadRooms();
loadUsers();
