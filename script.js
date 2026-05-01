const Shared = window.CoopMarioShared;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const roomForm = document.getElementById("roomForm");
const roomCodeInput = document.getElementById("roomCodeInput");
const roomHint = document.getElementById("roomHint");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");

const roomValue = document.getElementById("roomValue");
const roleValue = document.getElementById("roleValue");
const levelValue = document.getElementById("levelValue");
const coinsValue = document.getElementById("coinsValue");
const scoreValue = document.getElementById("scoreValue");
const stateValue = document.getElementById("stateValue");
const shareValue = document.getElementById("shareValue");
const partnerValue = document.getElementById("partnerValue");
const tipValue = document.getElementById("tipValue");

const overlay = document.getElementById("overlay");
const overlayKicker = document.getElementById("overlayKicker");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const overlayPrimary = document.getElementById("overlayPrimary");
const restartBtn = document.getElementById("restartBtn");
const pads = [...document.querySelectorAll(".pad")];

const idleLevel = Shared.createLevel(0);
const runtimeConfig = window.MarioGameConfig || {};

const client = {
  socket: null,
  connected: false,
  roomCode: "",
  role: "",
  snapshot: null,
  levelIndex: -1,
  levelGeometry: null,
  cameraX: 0,
  input: {
    left: false,
    right: false,
    jump: false,
  },
  lastSentInput: "",
  pendingJoin: null,
  notice: "先创建房间，再开始双人闯关。",
};

function socketUrl() {
  if (runtimeConfig.serverOrigin) {
    const origin = runtimeConfig.serverOrigin.replace(/\/+$/, "");
    if (origin.startsWith("ws://") || origin.startsWith("wss://")) {
      return origin;
    }
    if (origin.startsWith("http://")) {
      return `ws://${origin.slice("http://".length)}`;
    }
    if (origin.startsWith("https://")) {
      return `wss://${origin.slice("https://".length)}`;
    }
  }
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${location.host}`;
}

function normalizeRoomCode(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function send(data) {
  if (!client.socket || client.socket.readyState !== WebSocket.OPEN) {
    return;
  }
  client.socket.send(JSON.stringify(data));
}

function ensureSocket() {
  if (client.socket && (client.socket.readyState === WebSocket.OPEN || client.socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  client.socket = new WebSocket(socketUrl());

  client.socket.addEventListener("open", () => {
    client.connected = true;
    stateValue.textContent = "已连接";
    client.notice = "服务器已连接。";
    if (client.pendingJoin !== null) {
      send({ type: "join", roomCode: client.pendingJoin });
    }
    updateUi();
  });

  client.socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    handleMessage(payload);
  });

  client.socket.addEventListener("close", () => {
    client.connected = false;
    client.socket = null;
    client.snapshot = null;
    client.role = "";
    client.roomCode = "";
    client.levelIndex = -1;
    client.levelGeometry = null;
    client.lastSentInput = "";
    client.notice = "连接已断开，请刷新页面或重启服务器。";
    updateUi();
  });

  client.socket.addEventListener("error", () => {
    client.notice = "WebSocket 连接失败，请确认 Node 服务已经启动。";
    updateUi();
  });
}

function handleMessage(payload) {
  if (payload.type === "joined") {
    client.roomCode = payload.roomCode;
    client.role = payload.role;
    client.pendingJoin = payload.roomCode;
    roomCodeInput.value = payload.roomCode;
    location.hash = payload.roomCode;
    pushInput(true);
  }

  if (payload.type === "snapshot") {
    client.snapshot = payload;
    if (client.levelIndex !== payload.levelIndex) {
      client.levelIndex = payload.levelIndex;
      client.levelGeometry = Shared.createLevel(payload.levelIndex);
    }
    updateUi();
  }

  if (payload.type === "error") {
    client.notice = payload.message;
    updateUi();
  }
}

function joinRoom(roomCode) {
  client.pendingJoin = normalizeRoomCode(roomCode);
  client.notice = client.pendingJoin ? `正在加入房间 ${client.pendingJoin}...` : "正在创建新房间...";
  ensureSocket();
  if (client.socket && client.socket.readyState === WebSocket.OPEN) {
    send({ type: "join", roomCode: client.pendingJoin });
  }
  updateUi();
}

function pushInput(force = false) {
  if (!client.role) {
    return;
  }

  const next = JSON.stringify(client.input);
  if (!force && next === client.lastSentInput) {
    return;
  }

  client.lastSentInput = next;
  send({ type: "input", input: client.input });
}

function setControl(control, active) {
  client.input[control] = active;
  const button = pads.find((pad) => pad.dataset.control === control);
  if (button) {
    button.classList.toggle("active", active);
  }
  pushInput();
}

function requestRestart() {
  if (!client.role) {
    joinRoom("");
    return;
  }
  send({ type: "restart" });
}

function getSnapshot() {
  return client.snapshot;
}

function currentLevel() {
  return client.levelGeometry || idleLevel;
}

function localPlayer(snapshot) {
  if (!snapshot || !client.role) {
    return null;
  }
  return snapshot.players[client.role] && snapshot.players[client.role].connected
    ? snapshot.players[client.role]
    : null;
}

function readableState(roomState) {
  return {
    waiting: "等待队友",
    running: "进行中",
    transition: "过关中",
    lost: "等待重开",
    complete: "全部通关",
  }[roomState] || (client.connected ? "已连接" : "未联机");
}

function updateUi() {
  const snapshot = getSnapshot();
  const role = client.role ? Shared.CHARACTERS[client.role].label : "未分配";
  const level = currentLevel();
  const roomText = client.roomCode || (client.connected ? "就绪" : "未联机");

  roomValue.textContent = roomText;
  roleValue.textContent = role;
  levelValue.textContent = `${(snapshot ? snapshot.levelIndex : 0) + 1} / ${Shared.LEVEL_COUNT}`;
  coinsValue.textContent = snapshot ? `${snapshot.coins} / ${snapshot.totalCoins}` : `0 / ${level.coins.length}`;
  scoreValue.textContent = snapshot ? `${snapshot.score}` : "0";
  stateValue.textContent = snapshot ? readableState(snapshot.roomState) : (client.connected ? "已连接" : "未联机");

  if (client.roomCode) {
    shareValue.textContent = `${location.origin}/#${client.roomCode}`;
  } else {
    shareValue.textContent = "请先创建房间";
  }

  if (snapshot) {
    const partnerRole = client.role === "mario" ? "princess" : "mario";
    const partner = snapshot.players[partnerRole];
    partnerValue.textContent = partner && partner.connected ? `${partner.name} 已加入` : `${Shared.CHARACTERS[partnerRole].label} 未加入`;
    roomHint.textContent = `房间 ${snapshot.roomCode}。把这个房间码发给另一位玩家，加入后即可开始。`;
  } else {
    partnerValue.textContent = "等待加入";
    roomHint.textContent = "把房间码发给另一位玩家。第一位玩家是马里奥，第二位玩家是公主。";
  }

  const stageTips = [
    "第一关主要练习跳跃节奏和过坑距离。",
    "第二关会加入尖刺、窄平台和更高的路线。",
    "第三关会加入移动火球和更长的连续跳跃。",
  ];
  tipValue.textContent = stageTips[snapshot ? snapshot.levelIndex : 0];

  updateOverlay();
}

function updateOverlay() {
  const snapshot = getSnapshot();

  let kicker = "联机游戏";
  let title = "创建房间";
  let text = client.notice;
  let primaryLabel = "创建房间";
  let showPrimary = true;
  let showRestart = false;
  let hidden = false;

  if (!client.connected && !snapshot) {
    title = "服务器未启动";
    text = "请先运行 node server.js，然后通过 http://localhost:3000 或局域网地址打开页面。";
    primaryLabel = "重试";
  } else if (!client.roomCode) {
    title = "创建房间";
    text = "第一位玩家会成为马里奥，第二位加入同一房间的玩家会成为公主。";
    primaryLabel = "创建房间";
  } else if (!snapshot) {
    title = "正在加入房间";
    text = client.notice;
    primaryLabel = "重试";
  } else if (snapshot.roomState === "waiting") {
    kicker = "房间已就绪";
    title = "等待队友加入";
    text = `${snapshot.message} 房间码：${snapshot.roomCode}。`;
    showPrimary = false;
  } else if (snapshot.roomState === "running") {
    hidden = true;
  } else if (snapshot.roomState === "transition") {
    kicker = "本关通过";
    title = snapshot.levelIndex === Shared.LEVEL_COUNT - 1 ? "终点已到达" : "下一关加载中";
    text = snapshot.message;
    showPrimary = false;
  } else if (snapshot.roomState === "lost") {
    kicker = "队伍失败";
    title = "本关失败";
    text = `${snapshot.message} 按 R 或点击按钮即可重开本关。`;
    showPrimary = false;
    showRestart = true;
  } else if (snapshot.roomState === "complete") {
    kicker = "胜利";
    title = "三关全部通关";
    text = `${snapshot.message} 最终分数：${snapshot.score}。`;
    showPrimary = false;
    showRestart = true;
  }

  overlay.classList.toggle("hidden", hidden);
  overlayKicker.textContent = kicker;
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlayPrimary.textContent = primaryLabel;
  overlayPrimary.hidden = !showPrimary;
  restartBtn.hidden = !showRestart;
}

function drawCloud(x, y, scale, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  for (const [dx, dy, r] of [[0, 0, 24], [28, -10, 20], [56, 0, 24], [30, 8, 26]]) {
    ctx.beginPath();
    ctx.arc(dx, dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBackground(themeKey, cameraX, time) {
  const theme = Shared.THEMES[themeKey] || Shared.THEMES.meadow;
  const sky = ctx.createLinearGradient(0, 0, 0, Shared.VIEW.height);
  sky.addColorStop(0, theme.skyTop);
  sky.addColorStop(0.6, theme.skyMid);
  sky.addColorStop(1, theme.skyBottom);

  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, Shared.VIEW.width, Shared.VIEW.height);

  ctx.fillStyle = theme.sun;
  ctx.beginPath();
  ctx.arc(Shared.VIEW.width - 128, 110, 44, 0, Math.PI * 2);
  ctx.fill();

  const layers = [
    { color: theme.hillBack, base: Shared.VIEW.height - 148, amp: 18, speed: 0.18 },
    { color: theme.hillFront, base: Shared.VIEW.height - 100, amp: 26, speed: 0.34 },
  ];

  for (const layer of layers) {
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    ctx.moveTo(0, Shared.VIEW.height);
    for (let x = 0; x <= Shared.VIEW.width + 60; x += 36) {
      const wave = Math.sin((x + cameraX * layer.speed + time * 55) * 0.015) * layer.amp;
      ctx.lineTo(x, layer.base + wave);
    }
    ctx.lineTo(Shared.VIEW.width, Shared.VIEW.height);
    ctx.closePath();
    ctx.fill();
  }

  drawCloud(120 - cameraX * 0.14, 94, 1.05, theme.cloud);
  drawCloud(430 - cameraX * 0.18, 152, 0.92, theme.cloud);
  drawCloud(760 - cameraX * 0.1, 88, 1.2, theme.cloud);
}

function drawTile(tile, x, y) {
  if (tile === "G") {
    ctx.fillStyle = "#855731";
    ctx.fillRect(x, y, Shared.TILE, Shared.TILE);
    ctx.fillStyle = "#53b64a";
    ctx.fillRect(x, y, Shared.TILE, 10);
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.fillRect(x + 6, y + 14, Shared.TILE - 12, 5);
  }

  if (tile === "B") {
    ctx.fillStyle = "#d99046";
    ctx.fillRect(x, y, Shared.TILE, Shared.TILE);
    ctx.fillStyle = "#a55f2d";
    ctx.fillRect(x, y, Shared.TILE, 6);
    ctx.fillStyle = "#f1c987";
    ctx.fillRect(x + 7, y + 9, 10, 10);
    ctx.fillRect(x + 24, y + 23, 9, 9);
  }

  if (tile === "P") {
    ctx.fillStyle = "#33a85c";
    ctx.fillRect(x, y, Shared.TILE, Shared.TILE);
    ctx.fillStyle = "#7de28c";
    ctx.fillRect(x, y, Shared.TILE, 8);
    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    ctx.fillRect(x + 7, y + 10, 8, Shared.TILE - 16);
  }

  if (tile === "S") {
    ctx.fillStyle = "#d84b42";
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x + i * 15, y + Shared.TILE);
      ctx.lineTo(x + i * 15 + 8, y + 8);
      ctx.lineTo(x + i * 15 + 15, y + Shared.TILE);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawGoal(level, cameraX) {
  const castleX = level.goal.x - 56 - cameraX;
  const baseY = level.goal.y + level.goal.h - 18;

  ctx.fillStyle = "#6c7487";
  ctx.fillRect(castleX - 8, baseY - 138, 94, 138);
  ctx.fillStyle = "#8791a7";
  ctx.fillRect(castleX + 16, baseY - 160, 24, 22);
  ctx.fillRect(castleX + 46, baseY - 160, 24, 22);
  ctx.fillStyle = "#465063";
  ctx.fillRect(castleX + 28, baseY - 62, 28, 62);
  ctx.fillStyle = "#f4d36f";
  ctx.fillRect(castleX + 6, baseY - 114, 14, 28);
}

function drawCoins(level, coinStates, cameraX, time) {
  for (let i = 0; i < level.coins.length; i += 1) {
    if (coinStates && coinStates[i]) {
      continue;
    }

    const coin = level.coins[i];
    const bob = Math.sin(time * 7 + coin.x * 0.01) * 3;
    const x = coin.x - cameraX;
    const y = coin.y + bob;

    ctx.fillStyle = "#ffd84d";
    ctx.beginPath();
    ctx.ellipse(x, y, 11, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff5bc";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

function drawEnemy(enemy, cameraX, time) {
  if (!enemy.alive) {
    return;
  }

  const x = enemy.x - cameraX;
  const y = enemy.y;
  const feet = Math.sin(time * 18 + enemy.x * 0.02) * 1.4;

  ctx.fillStyle = "#8c4b21";
  ctx.beginPath();
  ctx.arc(x + 17, y + 17, 17, Math.PI, 0);
  ctx.lineTo(x + 34, y + 31);
  ctx.lineTo(x, y + 31);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#f7e6c4";
  ctx.fillRect(x + 6, y + 15, 22, 12);
  ctx.fillStyle = "#2e2117";
  ctx.fillRect(x + 10, y + 19, 4, 4);
  ctx.fillRect(x + 20, y + 19, 4, 4);
  ctx.fillRect(x + 8, y + 31, 6, 3 + feet);
  ctx.fillRect(x + 20, y + 31, 6, 3 - feet);
}

function drawFireball(fireball, cameraX, time) {
  const x = fireball.x - cameraX;
  const pulse = 1 + Math.sin(time * 12 + x * 0.02) * 0.08;

  ctx.fillStyle = "rgba(255, 142, 69, 0.24)";
  ctx.beginPath();
  ctx.arc(x, fireball.y, fireball.r * 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ff9d41";
  ctx.beginPath();
  ctx.arc(x, fireball.y, fireball.r * pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fff3be";
  ctx.beginPath();
  ctx.arc(x - 4, fireball.y - 4, fireball.r * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

function drawMario(player, cameraX) {
  const x = player.x - cameraX;
  const y = player.y;

  ctx.fillStyle = "#e14434";
  ctx.fillRect(x + 4, y + 2, 22, 8);
  ctx.fillRect(x + 7, y + 8, 16, 5);

  ctx.fillStyle = "#f2c29f";
  ctx.fillRect(x + 8, y + 12, 14, 12);

  ctx.fillStyle = "#d83d30";
  ctx.fillRect(x + 5, y + 24, 20, 7);

  ctx.fillStyle = "#2870d9";
  ctx.fillRect(x + 4, y + 31, 22, 7);
  ctx.fillRect(x + 6, y + 24, 6, 14);
  ctx.fillRect(x + 18, y + 24, 6, 14);

  ctx.fillStyle = "#553324";
  ctx.fillRect(x + 5, y + 38, 7, 4);
  ctx.fillRect(x + 18, y + 38, 7, 4);
}

function drawPrincess(player, cameraX) {
  const x = player.x - cameraX;
  const y = player.y;

  ctx.fillStyle = "#f1c5a7";
  ctx.fillRect(x + 9, y + 12, 14, 12);

  ctx.fillStyle = "#ff79b5";
  ctx.beginPath();
  ctx.moveTo(x + 6, y + 24);
  ctx.lineTo(x + 26, y + 24);
  ctx.lineTo(x + 30, y + 39);
  ctx.lineTo(x + 2, y + 39);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#f7cf42";
  ctx.beginPath();
  ctx.moveTo(x + 8, y + 12);
  ctx.lineTo(x + 11, y + 4);
  ctx.lineTo(x + 15, y + 12);
  ctx.lineTo(x + 19, y + 4);
  ctx.lineTo(x + 23, y + 12);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#7a482b";
  ctx.fillRect(x + 7, y + 10, 18, 4);
  ctx.fillRect(x + 5, y + 24, 4, 10);
  ctx.fillRect(x + 23, y + 24, 4, 10);
  ctx.fillRect(x + 8, y + 39, 5, 3);
  ctx.fillRect(x + 18, y + 39, 5, 3);
}

function drawPlayer(player, role, cameraX, isLocal) {
  if (!player || !player.connected) {
    return;
  }

  const centerX = player.x - cameraX + player.w / 2;
  const labelY = player.y - 14;

  ctx.save();
  if (player.facing < 0) {
    ctx.translate(player.x - cameraX + player.w / 2, 0);
    ctx.scale(-1, 1);
    ctx.translate(-(player.x - cameraX + player.w / 2), 0);
  }

  if (role === "mario") {
    drawMario(player, cameraX);
  } else {
    drawPrincess(player, cameraX);
  }

  ctx.restore();

  ctx.fillStyle = isLocal ? "#ffe27a" : "rgba(255, 255, 255, 0.82)";
  ctx.fillRect(centerX - 30, labelY, 60, 14);
  ctx.fillStyle = "#1f2634";
  ctx.font = "11px Bahnschrift, Trebuchet MS, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(player.name, centerX, labelY + 11);

  if (player.atGoal) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, player.y + 18, 24, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawOffscreenMarkers(snapshot, cameraX) {
  for (const role of Shared.ROLE_ORDER) {
    if (role === client.role) {
      continue;
    }

    const player = snapshot.players[role];
    if (!player || !player.connected) {
      continue;
    }

    const screenX = player.x - cameraX;
    if (screenX >= 30 && screenX <= Shared.VIEW.width - 30) {
      continue;
    }

    const clampedX = screenX < 0 ? 24 : Shared.VIEW.width - 24;
    const direction = screenX < 0 ? -1 : 1;

    ctx.fillStyle = role === "princess" ? "#ff86bf" : "#ffde76";
    ctx.beginPath();
    ctx.moveTo(clampedX, 70);
    ctx.lineTo(clampedX - 14 * direction, 58);
    ctx.lineTo(clampedX - 14 * direction, 82);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#142033";
    ctx.fillRect(clampedX - 34, 84, 68, 14);
    ctx.fillStyle = "#fff4de";
    ctx.font = "11px Bahnschrift, Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(player.name, clampedX, 95);
  }
}

function drawScene(time) {
  const snapshot = getSnapshot();
  const level = currentLevel();
  const levelWidth = level.width * Shared.TILE;
  const follow = localPlayer(snapshot) || (snapshot && snapshot.players.mario.connected ? snapshot.players.mario : null);
  const target = follow ? follow.x - Shared.VIEW.width * 0.35 : level.spawn.x - Shared.VIEW.width * 0.35;

  client.cameraX += (target - client.cameraX) * 0.08;
  client.cameraX = Shared.clamp(client.cameraX, 0, Math.max(0, levelWidth - Shared.VIEW.width));

  drawBackground(level.theme, client.cameraX, time);
  drawGoal(level, client.cameraX);

  const startCol = Math.floor(client.cameraX / Shared.TILE);
  const endCol = Math.ceil((client.cameraX + Shared.VIEW.width) / Shared.TILE) + 1;

  for (let y = 0; y < level.height; y += 1) {
    for (let x = startCol; x < endCol; x += 1) {
      const tile = Shared.tileAt(level, x, y);
      if (tile === ".") {
        continue;
      }
      drawTile(tile, x * Shared.TILE - client.cameraX, y * Shared.TILE);
    }
  }

  if (snapshot) {
    drawCoins(level, snapshot.coinStates, client.cameraX, time);

    for (const enemy of snapshot.enemies) {
      drawEnemy(enemy, client.cameraX, time);
    }

    for (const fireball of snapshot.fireballs) {
      drawFireball(fireball, client.cameraX, time);
    }

    for (const role of Shared.ROLE_ORDER) {
      if (role === client.role) {
        continue;
      }
      drawPlayer(snapshot.players[role], role, client.cameraX, false);
    }

    if (client.role) {
      drawPlayer(snapshot.players[client.role], client.role, client.cameraX, true);
    }

    drawOffscreenMarkers(snapshot, client.cameraX);
  } else {
    drawCoins(level, [], client.cameraX, time);
  }
}

function frame(timestamp) {
  drawScene(timestamp / 1000);
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "a", "A"].includes(event.key)) {
    setControl("left", true);
  }
  if (["ArrowRight", "d", "D"].includes(event.key)) {
    setControl("right", true);
  }
  if (["ArrowUp", "w", "W", " "].includes(event.key)) {
    setControl("jump", true);
  }
  if (["ArrowLeft", "ArrowRight", "ArrowUp", " "].includes(event.key)) {
    event.preventDefault();
  }
  if (event.key === "r" || event.key === "R") {
    requestRestart();
  }
});

window.addEventListener("keyup", (event) => {
  if (["ArrowLeft", "a", "A"].includes(event.key)) {
    setControl("left", false);
  }
  if (["ArrowRight", "d", "D"].includes(event.key)) {
    setControl("right", false);
  }
  if (["ArrowUp", "w", "W", " "].includes(event.key)) {
    setControl("jump", false);
  }
});

for (const pad of pads) {
  const control = pad.dataset.control;
  const press = (event) => {
    event.preventDefault();
    setControl(control, true);
  };
  const release = (event) => {
    event.preventDefault();
    setControl(control, false);
  };

  pad.addEventListener("pointerdown", press);
  pad.addEventListener("pointerup", release);
  pad.addEventListener("pointerleave", release);
  pad.addEventListener("pointercancel", release);
}

roomForm.addEventListener("submit", (event) => {
  event.preventDefault();
  joinRoom(roomCodeInput.value);
});

createBtn.addEventListener("click", () => {
  joinRoom("");
});

joinBtn.addEventListener("click", (event) => {
  event.preventDefault();
  joinRoom(roomCodeInput.value);
});

overlayPrimary.addEventListener("click", () => {
  if (!client.roomCode) {
    joinRoom("");
    return;
  }

  if (!client.connected) {
    ensureSocket();
    return;
  }

  joinRoom(client.roomCode);
});

restartBtn.addEventListener("click", requestRestart);

setInterval(() => {
  pushInput();
}, 60);

const hashRoom = normalizeRoomCode(location.hash.replace(/^#/, ""));
if (hashRoom) {
  roomCodeInput.value = hashRoom;
  joinRoom(hashRoom);
} else {
  ensureSocket();
}

updateUi();
requestAnimationFrame(frame);
