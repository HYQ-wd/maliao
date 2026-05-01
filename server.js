const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const Shared = require("./shared.js");

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";
const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
};

const rooms = new Map();
const clients = new Map();

function normalizeRoomCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function uniqueRoomCode() {
  let code = generateRoomCode();
  while (rooms.has(code)) {
    code = generateRoomCode();
  }
  return code;
}

function missingRole(room) {
  return Shared.ROLE_ORDER.find((role) => !room.roles[role]) || null;
}

function playersReady(room) {
  return Boolean(room.roles.mario && room.roles.princess);
}

function createPlayer(role, spawn, offset) {
  return {
    role,
    name: Shared.CHARACTERS[role].label,
    x: spawn.x + offset,
    y: spawn.y,
    prevY: spawn.y,
    w: 30,
    h: 40,
    vx: 0,
    vy: 0,
    speed: 315,
    jumpPower: 760,
    onGround: false,
    coyote: 0,
    facing: role === "princess" ? -1 : 1,
    atGoal: false,
    jumpHeld: false,
  };
}

function createRoom(code) {
  const room = {
    code,
    roles: {
      mario: null,
      princess: null,
    },
    inputs: {
      mario: { left: false, right: false, jump: false },
      princess: { left: false, right: false, jump: false },
    },
    players: {
      mario: null,
      princess: null,
    },
    state: "waiting",
    levelIndex: 0,
    level: Shared.createLevel(0),
    score: 0,
    levelBaseScore: 0,
    coins: 0,
    totalCoins: 0,
    transitionTimer: 0,
    message: "等待玩家加入。",
  };

  room.totalCoins = room.level.coins.length;
  return room;
}

function rebuildPlayers(room) {
  room.players.mario = room.roles.mario ? createPlayer("mario", room.level.spawn, -12) : null;
  room.players.princess = room.roles.princess ? createPlayer("princess", room.level.spawn, 14) : null;
}

function waitingMessage(room, baseMessage) {
  const missing = missingRole(room);
  if (!missing) {
    return baseMessage || "两位玩家已就绪。";
  }
  return baseMessage || `等待${Shared.CHARACTERS[missing].label}加入。`;
}

function loadLevel(room, index) {
  room.levelIndex = index;
  room.level = Shared.createLevel(index);
  room.coins = 0;
  room.totalCoins = room.level.coins.length;
  room.levelBaseScore = room.score;
  room.transitionTimer = 0;
  room.state = playersReady(room) ? "running" : "waiting";
  room.message = playersReady(room) ? room.level.name : waitingMessage(room);
  rebuildPlayers(room);
}

function startCampaign(room) {
  room.score = 0;
  loadLevel(room, 0);
}

function restartCurrentLevel(room) {
  room.score = room.levelBaseScore;
  loadLevel(room, room.levelIndex);
}

function resetRoomToWaiting(room, message) {
  room.score = 0;
  room.levelIndex = 0;
  room.level = Shared.createLevel(0);
  room.levelBaseScore = 0;
  room.coins = 0;
  room.totalCoins = room.level.coins.length;
  room.transitionTimer = 0;
  room.state = "waiting";
  room.message = waitingMessage(room, message);
  rebuildPlayers(room);
}

function roomSnapshot(room) {
  const players = {};
  for (const role of Shared.ROLE_ORDER) {
    const player = room.players[role];
    players[role] = player
      ? {
          connected: true,
          name: player.name,
          x: player.x,
          y: player.y,
          w: player.w,
          h: player.h,
          vx: player.vx,
          vy: player.vy,
          facing: player.facing,
          atGoal: player.atGoal,
        }
      : {
          connected: false,
          name: Shared.CHARACTERS[role].label,
        };
  }

  return {
    type: "snapshot",
    roomCode: room.code,
    roomState: room.state,
    levelIndex: room.levelIndex,
    levelName: room.level.name,
    score: room.score,
    coins: room.coins,
    totalCoins: room.totalCoins,
    message: room.message,
    players,
    coinStates: room.level.coins.map((coin) => coin.collected),
    enemies: room.level.enemies.map((enemy) => ({
      x: enemy.x,
      y: enemy.y,
      w: enemy.w,
      h: enemy.h,
      alive: enemy.alive,
      facing: enemy.vx < 0 ? -1 : 1,
    })),
    fireballs: room.level.fireballs.map((fireball) => ({
      x: fireball.x,
      y: fireball.y,
      r: fireball.r,
    })),
  };
}

function sendFrame(socket, payload, opcode = 0x1) {
  if (socket.destroyed) {
    return;
  }

  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let header;

  if (body.length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = body.length;
  } else if (body.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }

  socket.write(Buffer.concat([header, body]));
}

function sendJson(client, payload) {
  sendFrame(client.socket, JSON.stringify(payload));
}

function broadcast(room, payload) {
  for (const role of Shared.ROLE_ORDER) {
    const client = room.roles[role];
    if (client) {
      sendJson(client, payload);
    }
  }
}

function moveEntity(entity, level, dt, bounceHorizontal) {
  entity.x += entity.vx * dt;

  let minX = Math.floor(entity.x / Shared.TILE);
  let maxX = Math.floor((entity.x + entity.w - 1) / Shared.TILE);
  let minY = Math.floor(entity.y / Shared.TILE);
  let maxY = Math.floor((entity.y + entity.h - 1) / Shared.TILE);

  for (let ty = minY; ty <= maxY; ty += 1) {
    for (let tx = minX; tx <= maxX; tx += 1) {
      const tile = Shared.tileAt(level, tx, ty);
      if (!Shared.isSolidTile(tile)) {
        continue;
      }

      const tileRect = { x: tx * Shared.TILE, y: ty * Shared.TILE, w: Shared.TILE, h: Shared.TILE };
      if (!Shared.rectsOverlap(entity, tileRect)) {
        continue;
      }

      if (entity.vx > 0) {
        entity.x = tileRect.x - entity.w;
      } else if (entity.vx < 0) {
        entity.x = tileRect.x + tileRect.w;
      }

      entity.vx = bounceHorizontal ? -entity.vx : 0;
      minX = Math.floor(entity.x / Shared.TILE);
      maxX = Math.floor((entity.x + entity.w - 1) / Shared.TILE);
    }
  }

  entity.y += entity.vy * dt;
  minX = Math.floor(entity.x / Shared.TILE);
  maxX = Math.floor((entity.x + entity.w - 1) / Shared.TILE);
  minY = Math.floor(entity.y / Shared.TILE);
  maxY = Math.floor((entity.y + entity.h - 1) / Shared.TILE);
  let grounded = false;

  for (let ty = minY; ty <= maxY; ty += 1) {
    for (let tx = minX; tx <= maxX; tx += 1) {
      const tile = Shared.tileAt(level, tx, ty);
      if (!Shared.isSolidTile(tile)) {
        continue;
      }

      const tileRect = { x: tx * Shared.TILE, y: ty * Shared.TILE, w: Shared.TILE, h: Shared.TILE };
      if (!Shared.rectsOverlap(entity, tileRect)) {
        continue;
      }

      if (entity.vy > 0) {
        entity.y = tileRect.y - entity.h;
        grounded = true;
      } else if (entity.vy < 0) {
        entity.y = tileRect.y + tileRect.h;
      }

      entity.vy = 0;
    }
  }

  return grounded;
}

function hasGroundAhead(enemy, level) {
  const lookX = enemy.vx >= 0 ? enemy.x + enemy.w + 2 : enemy.x - 2;
  const footY = enemy.y + enemy.h + 2;
  const tx = Math.floor(lookX / Shared.TILE);
  const ty = Math.floor(footY / Shared.TILE);
  return Shared.isSolidTile(Shared.tileAt(level, tx, ty));
}

function hitsSpikeTile(entity, level) {
  const minX = Math.floor(entity.x / Shared.TILE);
  const maxX = Math.floor((entity.x + entity.w - 1) / Shared.TILE);
  const minY = Math.floor(entity.y / Shared.TILE);
  const maxY = Math.floor((entity.y + entity.h - 1) / Shared.TILE);

  for (let ty = minY; ty <= maxY; ty += 1) {
    for (let tx = minX; tx <= maxX; tx += 1) {
      const tile = Shared.tileAt(level, tx, ty);
      if (!Shared.isHazardTile(tile)) {
        continue;
      }

      const spikeRect = {
        x: tx * Shared.TILE + 4,
        y: ty * Shared.TILE + 10,
        w: Shared.TILE - 8,
        h: Shared.TILE - 10,
      };
      if (Shared.rectsOverlap(entity, spikeRect)) {
        return true;
      }
    }
  }

  return false;
}

function hitsFireball(player, level) {
  return level.fireballs.some((fireball) =>
    Shared.rectsOverlap(player, {
      x: fireball.x - fireball.r,
      y: fireball.y - fireball.r,
      w: fireball.r * 2,
      h: fireball.r * 2,
    }),
  );
}

function triggerLoss(room, reason) {
  if (room.state !== "running") {
    return;
  }
  room.state = "lost";
  room.message = reason;
}

function updatePlayer(room, player, input, dt) {
  if (player.atGoal) {
    player.jumpHeld = input.jump;
    return;
  }

  player.prevY = player.y;
  player.coyote = Math.max(0, player.coyote - dt);

  const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  player.vx = direction * player.speed;
  if (direction !== 0) {
    player.facing = direction;
  }

  const jumpPressed = input.jump && !player.jumpHeld;
  if (jumpPressed && (player.onGround || player.coyote > 0)) {
    player.vy = -player.jumpPower;
    player.onGround = false;
    player.coyote = 0;
  }

  player.vy += Shared.GRAVITY * dt;
  player.onGround = moveEntity(player, room.level, dt, false);

  if (player.onGround) {
    player.coyote = 0.08;
  }

  player.jumpHeld = input.jump;

  if (player.y > Shared.VIEW.height + 220) {
    triggerLoss(room, `${player.name}掉进了深坑。`);
    return;
  }

  if (hitsSpikeTile(player, room.level)) {
    triggerLoss(room, `${player.name}踩到了尖刺。`);
    return;
  }

  if (hitsFireball(player, room.level)) {
    triggerLoss(room, `${player.name}被火球击中了。`);
  }
}

function collectCoins(room, player) {
  for (const coin of room.level.coins) {
    if (coin.collected) {
      continue;
    }

    const hitbox = { x: coin.x - coin.r, y: coin.y - coin.r, w: coin.r * 2, h: coin.r * 2 };
    if (Shared.rectsOverlap(player, hitbox)) {
      coin.collected = true;
      room.coins += 1;
      room.score += 100;
    }
  }
}

function updateEnemies(room, dt) {
  for (const enemy of room.level.enemies) {
    if (!enemy.alive) {
      continue;
    }

    enemy.vy += Shared.GRAVITY * dt;
    const grounded = moveEntity(enemy, room.level, dt, true);

    if (grounded && !hasGroundAhead(enemy, room.level)) {
      enemy.vx *= -1;
    }

    if (enemy.y > Shared.VIEW.height + 200) {
      enemy.alive = false;
    }
  }
}

function updateFireballs(room, dt) {
  for (const fireball of room.level.fireballs) {
    fireball.x += fireball.vx * dt;

    if (fireball.x <= fireball.minX || fireball.x >= fireball.maxX) {
      fireball.x = Shared.clamp(fireball.x, fireball.minX, fireball.maxX);
      fireball.vx *= -1;
    }
  }
}

function handleEnemyHits(room) {
  for (const enemy of room.level.enemies) {
    if (!enemy.alive) {
      continue;
    }

    for (const role of Shared.ROLE_ORDER) {
      const player = room.players[role];
      if (!player || player.atGoal) {
        continue;
      }

      if (!Shared.rectsOverlap(player, enemy)) {
        continue;
      }

      const playerBottomBefore = player.prevY + player.h;
      const enemyTop = enemy.y + 8;

      if (player.vy > 120 && playerBottomBefore <= enemyTop) {
        enemy.alive = false;
        player.vy = -430;
        room.score += 150;
      } else {
        triggerLoss(room, `${player.name}碰到了敌人。`);
        return;
      }
    }
  }
}

function handleGoal(room) {
  const goalZone = {
    x: room.level.goal.x - 26,
    y: room.level.goal.y,
    w: 56,
    h: room.level.goal.h,
  };

  for (const role of Shared.ROLE_ORDER) {
    const player = room.players[role];
    if (!player || player.atGoal) {
      continue;
    }

    if (Shared.rectsOverlap(player, goalZone)) {
      player.atGoal = true;
      player.vx = 0;
      player.vy = 0;
      room.score += 200;
    }
  }

  if (!playersReady(room)) {
    return;
  }

  if (room.players.mario && room.players.princess && room.players.mario.atGoal && room.players.princess.atGoal) {
    room.score += 500;
    if (room.levelIndex === Shared.LEVEL_COUNT - 1) {
      room.state = "complete";
      room.message = "马里奥和公主已经一起通过了全部三关。";
    } else {
      room.state = "transition";
      room.transitionTimer = 2.2;
      room.message = `第 ${room.levelIndex + 1} 关通过，正在加载第 ${room.levelIndex + 2} 关。`;
    }
  }
}

function updateRoom(room, dt) {
  if (room.state === "waiting" || room.state === "lost" || room.state === "complete") {
    return;
  }

  if (room.state === "transition") {
    room.transitionTimer -= dt;
    if (room.transitionTimer <= 0) {
      loadLevel(room, room.levelIndex + 1);
    }
    return;
  }

  updateFireballs(room, dt);
  updateEnemies(room, dt);

  for (const role of Shared.ROLE_ORDER) {
    const player = room.players[role];
    if (!player) {
      continue;
    }
    updatePlayer(room, player, room.inputs[role], dt);
    if (room.state !== "running") {
      return;
    }
    collectCoins(room, player);
  }

  handleEnemyHits(room);
  if (room.state !== "running") {
    return;
  }

  handleGoal(room);
}

function leaveRoom(client) {
  if (!client.room) {
    return;
  }

  const room = client.room;
  room.roles[client.role] = null;
  room.inputs[client.role] = { left: false, right: false, jump: false };
  client.room = null;
  client.role = "";

  if (!room.roles.mario && !room.roles.princess) {
    rooms.delete(room.code);
    return;
  }

  resetRoomToWaiting(room, "有玩家断开连接，正在等待房间重新满员。");
  broadcast(room, roomSnapshot(room));
}

function joinRoom(client, rawCode) {
  leaveRoom(client);

  const requested = normalizeRoomCode(rawCode);
  const roomCode = requested || uniqueRoomCode();
  const room = rooms.get(roomCode) || createRoom(roomCode);
  rooms.set(roomCode, room);

  const role = missingRole(room);
  if (!role) {
    sendJson(client, { type: "error", message: "这个房间已经有两位玩家了。" });
    return;
  }

  room.roles[role] = client;
  client.room = room;
  client.role = role;

  sendJson(client, {
    type: "joined",
    roomCode: room.code,
    role,
  });

  if (playersReady(room)) {
    startCampaign(room);
  } else {
    resetRoomToWaiting(room);
  }

  broadcast(room, roomSnapshot(room));
}

function handleClientMessage(client, payload) {
  if (!payload || typeof payload !== "object") {
    return;
  }

  if (payload.type === "join") {
    joinRoom(client, payload.roomCode);
    return;
  }

  if (!client.room || !client.role) {
    return;
  }

  if (payload.type === "input" && payload.input) {
    client.room.inputs[client.role] = {
      left: Boolean(payload.input.left),
      right: Boolean(payload.input.right),
      jump: Boolean(payload.input.jump),
    };
  }

  if (payload.type === "restart") {
    if (!playersReady(client.room)) {
      return;
    }

    if (client.room.state === "complete") {
      startCampaign(client.room);
    } else {
      restartCurrentLevel(client.room);
    }

    broadcast(client.room, roomSnapshot(client.room));
  }
}

function parseFrames(client) {
  let buffer = client.socket.wsBuffer;
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;
    let headerLength = 2;

    if (length === 126) {
      if (offset + 4 > buffer.length) {
        break;
      }
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (offset + 10 > buffer.length) {
        break;
      }
      length = Number(buffer.readBigUInt64BE(offset + 2));
      headerLength = 10;
    }

    const maskLength = masked ? 4 : 0;
    const totalLength = headerLength + maskLength + length;
    if (offset + totalLength > buffer.length) {
      break;
    }

    const maskStart = offset + headerLength;
    const payloadStart = maskStart + maskLength;
    let payload = buffer.subarray(payloadStart, payloadStart + length);

    if (masked) {
      const mask = buffer.subarray(maskStart, maskStart + 4);
      const decoded = Buffer.alloc(length);
      for (let i = 0; i < length; i += 1) {
        decoded[i] = payload[i] ^ mask[i % 4];
      }
      payload = decoded;
    }

    if (opcode === 0x8) {
      client.socket.end();
      break;
    }

    if (opcode === 0x9) {
      sendFrame(client.socket, payload, 0x0a);
    }

    if (opcode === 0x1) {
      try {
        handleClientMessage(client, JSON.parse(payload.toString("utf8")));
      } catch (error) {
        sendJson(client, { type: "error", message: "WebSocket 数据格式无效。" });
      }
    }

    offset += totalLength;
  }

  client.socket.wsBuffer = buffer.subarray(offset);
}

function removeClient(client) {
  if (client.closed) {
    return;
  }

  client.closed = true;
  leaveRoom(client);
  clients.delete(client.id);
}

function serveStatic(req, res) {
  const requestedPath = new URL(req.url, "http://localhost").pathname;
  const routePath = requestedPath === "/" ? "/index.html" : requestedPath;
  const filePath = path.resolve(ROOT, `.${routePath}`);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("禁止访问");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500);
      res.end(error.code === "ENOENT" ? "页面不存在" : "服务器错误");
      return;
    }

    const extension = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[extension] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer(serveStatic);

server.on("upgrade", (req, socket) => {
  if ((req.headers.upgrade || "").toLowerCase() !== "websocket") {
    socket.destroy();
    return;
  }

  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "",
      "",
    ].join("\r\n"),
  );

  const client = {
    id: crypto.randomUUID(),
    socket,
    room: null,
    role: "",
    closed: false,
  };

  socket.wsBuffer = Buffer.alloc(0);
  clients.set(client.id, client);

  socket.on("data", (chunk) => {
    socket.wsBuffer = Buffer.concat([socket.wsBuffer, chunk]);
    parseFrames(client);
  });

  socket.on("close", () => removeClient(client));
  socket.on("end", () => removeClient(client));
  socket.on("error", () => removeClient(client));
});

setInterval(() => {
  for (const room of rooms.values()) {
    updateRoom(room, 1 / 60);
    broadcast(room, roomSnapshot(room));
  }
}, 1000 / 60);

server.listen(PORT, HOST, () => {
  console.log(`马里奥双人联机服务已启动：http://localhost:${PORT}`);
});
