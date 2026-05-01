(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CoopMarioShared = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const VIEW = { width: 960, height: 540 };
  const TILE = 45;
  const GRAVITY = 1900;
  const MAX_DT = 1 / 30;
  const LEVEL_COUNT = 3;
  const ROLE_ORDER = ["mario", "princess"];

  const CHARACTERS = {
    mario: { label: "马里奥", accent: "#e14334" },
    princess: { label: "公主", accent: "#ff7eb8" },
  };

  const THEMES = {
    meadow: {
      skyTop: "#7dd8ff",
      skyMid: "#caefff",
      skyBottom: "#f6da7c",
      sun: "rgba(255, 232, 144, 0.94)",
      hillBack: "#98d26f",
      hillFront: "#56955a",
      cloud: "rgba(255, 255, 255, 0.86)",
    },
    canyon: {
      skyTop: "#79c7ff",
      skyMid: "#ffd09f",
      skyBottom: "#e5814d",
      sun: "rgba(255, 241, 186, 0.92)",
      hillBack: "#d39a58",
      hillFront: "#935444",
      cloud: "rgba(255, 241, 223, 0.76)",
    },
    volcano: {
      skyTop: "#261739",
      skyMid: "#5b325d",
      skyBottom: "#fd8947",
      sun: "rgba(255, 207, 140, 0.82)",
      hillBack: "#6a394b",
      hillFront: "#37222e",
      cloud: "rgba(255, 194, 164, 0.34)",
    },
  };

  function makeGrid(width, height) {
    return Array.from({ length: height }, () => Array(width).fill("."));
  }

  function setRect(grid, x, y, w, h, tile) {
    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) {
        if (grid[row] && grid[row][col] !== undefined) {
          grid[row][col] = tile;
        }
      }
    }
  }

  function placeCoins(points) {
    return points.map(([x, y]) => ({
      x: x * TILE + TILE / 2,
      y: y * TILE + TILE / 2,
      r: 12,
      collected: false,
    }));
  }

  function placeEnemies(points) {
    return points.map(([x, y, direction = 1, speed = 82]) => ({
      x: x * TILE + 6,
      y: y * TILE + 6,
      w: 34,
      h: 34,
      vx: speed * direction,
      vy: 0,
      alive: true,
    }));
  }

  function placeFireballs(points) {
    return points.map(([x, y, minX, maxX, speed = 170]) => ({
      x: x * TILE + TILE / 2,
      y: y * TILE + TILE / 2,
      r: 14,
      vx: speed,
      minX: minX * TILE + TILE / 2,
      maxX: maxX * TILE + TILE / 2,
    }));
  }

  function createLevelOne() {
    const width = 84;
    const height = 12;
    const grid = makeGrid(width, height);

    setRect(grid, 0, 10, width, 2, "G");
    [
      [18, 10, 3, 2],
      [38, 10, 4, 2],
      [61, 10, 3, 2],
    ].forEach(([x, y, w, h]) => setRect(grid, x, y, w, h, "."));

    [
      [8, 8, 4, 1, "B"],
      [18, 7, 6, 1, "B"],
      [28, 6, 4, 1, "B"],
      [40, 8, 5, 1, "B"],
      [52, 7, 4, 1, "B"],
      [67, 8, 6, 1, "B"],
      [76, 6, 4, 1, "B"],
    ].forEach(([x, y, w, h, tile]) => setRect(grid, x, y, w, h, tile));

    [
      [24, 8, 2, 2],
      [57, 8, 2, 2],
      [73, 8, 2, 2],
    ].forEach(([x, y, w, h]) => setRect(grid, x, y, w, h, "P"));

    return {
      index: 0,
      name: "第一关 - 蘑菇草地",
      theme: "meadow",
      width,
      height,
      grid,
      coins: placeCoins([
        [9, 7], [10, 7], [11, 7],
        [20, 6], [22, 6], [23, 6],
        [29, 5], [31, 5],
        [41, 7], [43, 7], [44, 7],
        [53, 6], [55, 6],
        [68, 7], [70, 7], [72, 7],
        [77, 5], [79, 5],
      ]),
      enemies: placeEnemies([
        [13, 9, -1, 74],
        [33, 9, 1, 78],
        [47, 9, -1, 82],
        [58, 9, 1, 76],
        [79, 9, -1, 84],
      ]),
      fireballs: [],
      spawn: { x: TILE * 2.2, y: TILE * 8.2 },
      goal: { x: TILE * 80.5, y: TILE * 3, w: 26, h: TILE * 7 },
    };
  }

  function createLevelTwo() {
    const width = 100;
    const height = 12;
    const grid = makeGrid(width, height);

    setRect(grid, 0, 10, width, 2, "G");
    [
      [14, 10, 3, 2],
      [31, 10, 4, 2],
      [49, 10, 4, 2],
      [70, 10, 3, 2],
      [88, 10, 4, 2],
    ].forEach(([x, y, w, h]) => setRect(grid, x, y, w, h, "."));

    [
      [7, 8, 4, 1, "B"],
      [15, 6, 4, 1, "B"],
      [24, 7, 4, 1, "B"],
      [35, 5, 4, 1, "B"],
      [44, 7, 4, 1, "B"],
      [56, 6, 4, 1, "B"],
      [65, 5, 4, 1, "B"],
      [76, 7, 5, 1, "B"],
      [86, 6, 4, 1, "B"],
      [93, 5, 4, 1, "B"],
    ].forEach(([x, y, w, h, tile]) => setRect(grid, x, y, w, h, tile));

    [
      [21, 8, 2, 2],
      [60, 8, 2, 2],
      [96, 7, 2, 3],
    ].forEach(([x, y, w, h]) => setRect(grid, x, y, w, h, "P"));

    [
      [27, 9, 2, 1],
      [52, 9, 2, 1],
      [81, 9, 2, 1],
      [67, 4, 2, 1],
    ].forEach(([x, y, w, h]) => setRect(grid, x, y, w, h, "S"));

    return {
      index: 1,
      name: "第二关 - 管道高台",
      theme: "canyon",
      width,
      height,
      grid,
      coins: placeCoins([
        [8, 7], [9, 7], [10, 7],
        [16, 5], [18, 5],
        [25, 6], [27, 6],
        [36, 4], [38, 4],
        [45, 6], [47, 6],
        [57, 5], [59, 5],
        [66, 4], [68, 4],
        [77, 6], [79, 6], [80, 6],
        [87, 5], [89, 5],
        [94, 4], [96, 4],
      ]),
      enemies: placeEnemies([
        [10, 9, -1, 78],
        [29, 9, 1, 82],
        [41, 9, -1, 84],
        [58, 9, 1, 88],
        [74, 9, -1, 84],
        [91, 9, 1, 86],
      ]),
      fireballs: [],
      spawn: { x: TILE * 2.2, y: TILE * 8.2 },
      goal: { x: TILE * 96.5, y: TILE * 2.6, w: 26, h: TILE * 7.4 },
    };
  }

  function createLevelThree() {
    const width = 120;
    const height = 12;
    const grid = makeGrid(width, height);

    setRect(grid, 0, 10, width, 2, "G");
    [
      [12, 10, 3, 2],
      [25, 10, 4, 2],
      [40, 10, 4, 2],
      [55, 10, 3, 2],
      [69, 10, 5, 2],
      [84, 10, 4, 2],
      [99, 10, 4, 2],
    ].forEach(([x, y, w, h]) => setRect(grid, x, y, w, h, "."));

    [
      [6, 8, 4, 1, "B"],
      [15, 6, 4, 1, "B"],
      [23, 8, 3, 1, "B"],
      [31, 5, 4, 1, "B"],
      [44, 7, 4, 1, "B"],
      [53, 5, 3, 1, "B"],
      [61, 8, 4, 1, "B"],
      [73, 6, 4, 1, "B"],
      [82, 4, 4, 1, "B"],
      [93, 7, 4, 1, "B"],
      [103, 5, 4, 1, "B"],
      [111, 7, 5, 1, "B"],
    ].forEach(([x, y, w, h, tile]) => setRect(grid, x, y, w, h, tile));

    [
      [36, 8, 2, 2],
      [78, 8, 2, 2],
      [115, 7, 2, 3],
    ].forEach(([x, y, w, h]) => setRect(grid, x, y, w, h, "P"));

    [
      [18, 9, 2, 1],
      [34, 9, 2, 1],
      [57, 9, 2, 1],
      [75, 9, 2, 1],
      [101, 9, 2, 1],
      [84, 3, 2, 1],
    ].forEach(([x, y, w, h]) => setRect(grid, x, y, w, h, "S"));

    return {
      index: 2,
      name: "第三关 - 熔火城堡",
      theme: "volcano",
      width,
      height,
      grid,
      coins: placeCoins([
        [7, 7], [8, 7], [9, 7],
        [16, 5], [18, 5],
        [23, 7], [25, 7],
        [32, 4], [34, 4],
        [45, 6], [47, 6],
        [53, 4], [55, 4],
        [62, 7], [64, 7],
        [74, 5], [76, 5],
        [82, 3], [83, 3], [85, 3],
        [94, 6], [96, 6],
        [104, 4], [106, 4],
        [112, 6], [114, 6], [115, 6],
      ]),
      enemies: placeEnemies([
        [9, 9, -1, 88],
        [22, 9, 1, 92],
        [38, 9, -1, 88],
        [48, 9, 1, 92],
        [63, 9, -1, 94],
        [79, 9, 1, 94],
        [96, 9, -1, 96],
        [113, 9, 1, 98],
      ]),
      fireballs: placeFireballs([
        [29, 7, 27, 35, 150],
        [67, 6, 64, 71, 182],
        [107, 5, 104, 112, 195],
      ]),
      spawn: { x: TILE * 2.2, y: TILE * 8.2 },
      goal: { x: TILE * 116.5, y: TILE * 2.4, w: 26, h: TILE * 7.6 },
    };
  }

  function createLevel(index) {
    const builders = [createLevelOne, createLevelTwo, createLevelThree];
    const builder = builders[index] || builders[0];
    return builder();
  }

  function tileAt(level, tx, ty) {
    if (tx < 0 || ty < 0 || ty >= level.height || tx >= level.width) {
      return ".";
    }
    return level.grid[ty][tx];
  }

  function isSolidTile(tile) {
    return tile === "G" || tile === "B" || tile === "P";
  }

  function isHazardTile(tile) {
    return tile === "S";
  }

  function rectsOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  return {
    VIEW,
    TILE,
    GRAVITY,
    MAX_DT,
    LEVEL_COUNT,
    ROLE_ORDER,
    CHARACTERS,
    THEMES,
    createLevel,
    tileAt,
    isSolidTile,
    isHazardTile,
    rectsOverlap,
    clamp,
  };
});
