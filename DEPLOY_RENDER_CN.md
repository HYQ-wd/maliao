# Render 一站式部署

这个项目可以直接整站部署到 `Render`，不用再拆成 `Netlify + Render`。

原因很简单：

- `server.js` 会启动联机服务器
- `server.js` 也会把 `index.html`、`script.js`、`style.css` 这些前端文件一起提供出去

也就是说，这个项目本身就是“前后端一体”的。

## 你要做的事

### 1. 把项目传到 GitHub

最简单的办法：

1. 去 GitHub 新建一个仓库
2. 把当前这个项目文件夹传上去

如果你用 GitHub Desktop：

1. `File > Add local repository`
2. 选中这个项目文件夹
3. 如果它不是 git 仓库，按提示创建
4. 点 `Publish repository`

### 2. 登录 Render

打开：

`https://dashboard.render.com/`

### 3. 用 Blueprint 导入

因为项目里已经有 `render.yaml`，你可以少填很多配置。

步骤：

1. 在 Render 里点 `New`
2. 选择 `Blueprint`
3. 连接你的 GitHub
4. 选中这个项目仓库
5. Render 会自动读取仓库根目录下的 `render.yaml`
6. 直接确认创建

### 4. 等待部署完成

部署成功后，Render 会给你一个地址，类似：

`https://xxx.onrender.com`

你直接打开这个地址，就能看到游戏页面。

## 这个项目为什么可以只用 Render

关键文件：

- `server.js`：联机后端
- `index.html`：页面
- `script.js`：前端逻辑
- `shared.js`：前后端共用关卡和规则

Render 启动后会执行：

```bash
npm install
npm start
```

而 `npm start` 对应的是：

```json
"start": "node server.js"
```

所以 Render 实际上是在云端运行：

```bash
node server.js
```

这样前端和后端就在同一个服务里了。

## 你不需要改的东西

下面这些现在都不用填：

- `config.js`
- `serverOrigin`
- WebSocket 地址
- Render 端口号

因为项目已经写好了：

- Render 会给 `PORT`
- `server.js` 会自动读取 `PORT`
- 前端默认会连当前域名

## 如果你看到部署失败

先看 Render 的日志，通常只要看最后几行就够了。

常见检查项：

1. 仓库里是否包含这些文件：
   - `server.js`
   - `package.json`
   - `index.html`
   - `script.js`
   - `shared.js`

2. `package.json` 里是否有：

```json
"start": "node server.js"
```

3. Render 服务类型是不是 `Web Service`

不要选成 `Static Site`。

## 最简单的一句话方案

不要把这个项目拆开放。

直接：

1. 上传到 GitHub
2. 在 Render 里用 `Blueprint` 导入
3. 打开 Render 给你的网址
