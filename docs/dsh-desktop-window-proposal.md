# 提案：为 DSH 插件开放「桌面浮层窗口」能力

> 状态：草案（由 SoftPet 桌面宠物插件提出）
> 目标读者：DSH Desktop / 插件运行时维护者
> 关联插件：SoftPet（治愈桌宠）

## 1. 一句话

让插件可以声明式地创建**透明、无边框、置顶、可点击穿透**的桌面窗口，承载插件自己的
HTML/SVG 内容；窗口的生命周期、权限、跨平台差异由宿主统一管理。

## 2. 为什么现在做不到

这不是插件偷懒，而是三层约束共同决定的：

1. **插件宿主不在 Electron 主进程**
   `lib/main.js:3794` 用 `ELECTRON_RUN_AS_NODE=1` 把 DSH 运行时 spawn 成子进程
   （入口 `@deepseek-ai/dsh-desktop-host/lib/index.js`）。在该进程里 `require('electron')`
   不可用，拿不到 `BrowserWindow` / `screen` / `app`。
2. **主进程没有创建窗口的 IPC**
   现有 `ipcMain.handle` 通道只有目录选择、引导、更新、快捷键、内嵌浏览器视图等；
   没有任何 `createWindow` 语义的入口。
3. **客户端插件只能渲染在页面内**
   `shell.overlay` 是 DOM 的 fixed 浮层，天然被窗口边界裁剪；在浏览器访问模式下
   连"窗口"都不存在。

因此，桌面级浮层只能由**宿主主进程**创建，插件通过一个新 Host Service 声明需求。

## 3. 设计原则

- **声明式，不暴露 Electron**：插件给意图（透明、置顶、穿透、尺寸），宿主决定实现。
- **最小权限**：独立 capability，首次使用需用户确认；窗口内容默认无 Node 集成。
- **可降级**：平台不支持透明/穿透时，退化为"无边框置顶小窗"，并如实告知插件。
- **可回收**：插件卸载/禁用/崩溃时，其窗口必须自动销毁，不允许孤儿窗口。
- **不碰业务数据**：窗口只拿到插件自己发布的状态，宿主不代传会话内容。

## 4. 提议的 API

### 4.1 Manifest capability

```jsonc
{
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-ui-slots"] },
    "capabilities": ["desktop-window"]
  }
}
```

未声明 capability 时，`desktopWindows` 服务不可见（`ctx.get()` 返回 `undefined`），
而不是抛错。

### 4.2 Host Service：`desktopWindows`

```ts
interface DesktopWindowsService {
  /** 创建窗口；宿主可因权限/平台限制拒绝，返回结构化原因而不是抛异常。 */
  create(options: DesktopWindowOptions): Promise<DesktopWindowHandle>

  /** 当前插件已创建、仍存活的窗口。 */
  list(): DesktopWindowHandle[]
}

interface DesktopWindowOptions {
  /** 稳定 id，用于位置/尺寸记忆与去重；同一插件内唯一。 */
  id: string
  /** 插件内的相对路由，由宿主注入一次性 token 后加载。 */
  url: string
  /** 初始逻辑尺寸（DIP）。 */
  width: number
  height: number
  /** 初始位置；省略时由宿主放在主屏右下角并做边缘夹取。 */
  x?: number
  y?: number
  /** 透明背景；需要页面自身背景透明。 */
  transparent?: boolean       // 默认 true
  frame?: boolean             // 默认 false
  alwaysOnTop?: boolean       // 默认 true
  /** 整窗点击穿透；为 true 时页面收不到指针事件。 */
  clickThrough?: boolean      // 默认 false
  /** 是否出现在任务栏/Alt-Tab。 */
  skipTaskbar?: boolean       // 默认 true
  /** 是否可获得焦点；桌宠一般为 false。 */
  focusable?: boolean         // 默认 false
  resizable?: boolean         // 默认 false
  /** 记忆位置；宿主按 id 持久化，端口/版本变化不影响。 */
  rememberPosition?: boolean  // 默认 true
  /** 允许的最大/最小尺寸，供插件做缩放。 */
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  /** 跟随某个显示器；省略表示"用户拖到哪算哪"。 */
  display?: 'primary' | 'cursor' | string
  /** 圆角/阴影交给合成器，不在透明窗口里画。 */
  hasShadow?: boolean         // 默认 false
}

interface DesktopWindowHandle {
  readonly id: string
  readonly bounds: { x: number; y: number; width: number; height: number }

  show(): Promise<void>
  hide(): Promise<void>
  close(): Promise<void>

  setBounds(bounds: Partial<Bounds>): Promise<void>
  setAlwaysOnTop(on: boolean): Promise<void>
  /** 运行时切换穿透；用于"悬停时恢复交互"。 */
  setClickThrough(on: boolean): Promise<void>
  setOpacity(value: number): Promise<void>   // 0..1，平台不支持时忽略

  /** 向窗口页面发送消息（页面用 window.dshDesktop.onMessage 接收）。 */
  post(message: unknown): void

  on(event: 'ready' | 'closed' | 'moved' | 'resized' | 'display-changed', fn: (payload) => void): () => void
  /** 页面经 window.dshDesktop.send 发来的消息。 */
  onMessage(fn: (message: unknown) => void): () => void

  /** 外部全屏/演示/游戏状态；仅当宿主能感知时触发。 */
  onFullscreenChange(fn: (fullscreen: boolean) => void): () => void
}
```

关键点：

- **`clickThrough` 是整窗开关**，不是"某个 DOM 区域"。桌宠这类场景需要
  "窗口穿透 + 局部热区可点"，建议宿主额外提供 **region 模式**：
  `setInteractiveRegions(rects: Rect[])`，由主进程做命中测试（Windows 可用
  `WM_NCHITTEST` 返回 `HTTRANSPARENT`；macOS 用 `setIgnoreMouseEvents(true, {forward:true})`
  + 轮询光标）。若首版不做，插件可退化为"穿透关闭、但只画一个小窗口"，由用户取舍。
- **拖拽**不要依赖 `-webkit-app-region: drag`（与穿透冲突）。建议页面发
  `dshDesktop.beginDrag()`，主进程接管 move 循环，松手后回传最终 bounds。
- **位置记忆**由宿主按 `pluginId + windowId` 存在 profile 里，避免插件自己
  维护屏幕坐标（多显示器、DPI 变化时插件算不准）。

### 4.3 页面侧桥

```ts
// 仅在该窗口的页面里可用；普通 DSH 页面没有这个对象。
window.dshDesktop = {
  windowId: string
  send(message: unknown): void
  onMessage(fn: (message: unknown) => void): () => void
  beginDrag(): void
  setInteractiveRegions(rects: Rect[]): void
  close(): void
}
```

页面由宿主用独立 `session` partition 加载，`nodeIntegration: false`、
`contextIsolation: true`、`sandbox: true`，只注入这一个 preload 桥。
**不复用主窗口的 preload**，避免把主窗口能力泄漏给插件页面。

### 4.4 与现有插件的关系

- Host 侧：插件在 `apply(ctx)` 里 `ctx.get('desktopWindows')`，创建/销毁窗口，
  用 `ctx.effect` 保证卸载即关闭。
- Client 侧：**不需要改**。窗口加载的是插件自己的页面（可由 `webServer` 提供，
  或宿主直接托管插件包内的 `window.html`）。页面可复用现有渲染代码。
- 状态桥：窗口与主界面之间用 `postMessage`/SSE，不经过宿主业务层；
  宿主只保证通道存在。

## 5. 主进程实现要点（供参考）

1. **IPC**：在现有 child↔main 通道上新增
   `{ type: 'desktop-window', op: 'create'|'close'|'bounds'|..., requestId }`，
   main 侧维护 `Map<requestId, resolve>`；插件侧由 Host Service 封装成 Promise。
2. **窗口选项**：`frame:false`、`transparent:true`、`alwaysOnTop:true`、
   `skipTaskbar:true`、`hasShadow:false`、`focusable:false`、`show:false`；
   `ready-to-show` 后再 `show()`，避免白闪。
3. **穿透**：
   - Windows：`setIgnoreMouseEvents(true, { forward: true })` 可保留 hover；
     区域命中用 `WM_NCHITTEST` 或 `setIgnoreMouseEvents` + 轮询光标矩形。
   - macOS：`setIgnoreMouseEvents(true, { forward: true })`，配合
     `globalShortcut`/`screen` 轮询。
   - Linux/Wayland：穿透普遍不可用，降级为"小窗 + 关闭穿透"，并在
     `create()` 的返回里标注 `degraded: ['click-through']`。
4. **透明**：Windows 10+ 的 DWM 透明窗口在 `transparent:true` 下可用，
   但**不要**同时设置 `backgroundColor`；页面 `html,body{background:transparent}`。
5. **外部全屏感知**：
   - Windows：`SHQueryUserNotificationState`（`QUNS_RUNNING_D3D_FULL_SCREEN` /
     `QUNS_PRESENTATION_MODE`）或 `GetForegroundWindow` + 显示器矩形比对；
   - macOS：`NSWorkspace` 通知 + `CGWindowListCopyWindowInfo` 判断最前窗口是否覆盖屏幕；
   - Linux：X11 读 `_NET_WM_STATE_FULLSCREEN`；Wayland 无通用方案，如实返回"不支持"。
   这是网页层永远拿不到的信息，也是这个 API 最有价值的部分之一。
6. **生命周期**：插件 disable/unload 时，core 调 `desktopWindows.closeAll(pluginId)`；
   main 侧监听 renderer crash，窗口自毁；应用退出前统一 close。

## 6. 权限与安全

- capability `desktop-window` 默认关闭，首次 `create()` 弹一次宿主原生确认
  （"SoftPet 想在桌面上放一个小窗口"），可选择"仅本次/始终允许/拒绝"。
- 窗口页面**不能**访问 `file://`、不能导航到外部 URL；`will-navigate` 一律拦截，
  `setWindowOpenHandler` 返回 `deny`。
- 窗口与主窗口使用不同 session partition；不共享 cookie/localStorage。
- 限制每个插件最多 1–2 个窗口，避免被做成广告弹窗。
- 不提供"置顶于全屏应用之上"的开关；全屏时默认隐藏，符合"不打扰"。

## 7. 平台差异与降级矩阵

| 能力 | Windows | macOS | Linux X11 | Linux Wayland |
| --- | --- | --- | --- | --- |
| 透明无边框 | ✅ | ✅ | ✅（需合成器） | ⚠️ 取决于 compositor |
| 整窗穿透 | ✅ | ✅ | ✅ | ❌ |
| 区域穿透 | ✅（可做） | ⚠️（轮询） | ⚠️ | ❌ |
| 外部全屏感知 | ✅ | ✅ | ✅ | ❌ |
| 多显示器/DPI | ✅ | ✅ | ✅ | ✅ |

`create()` 返回值建议带 `degraded: string[]`，插件据此切换交互方案，而不是
静默失效。

## 8. SoftPet 适配草案

宿主 API 就绪后，SoftPet 只需改 host 半边（目前是空 `apply`）：

```js
// softpet/lib/index.js
export const inject = ['desktopWindows']

export function apply(ctx) {
  const wins = ctx.get('desktopWindows')
  if (!wins) return                       // 旧宿主：保持页面内浮层
  ctx.effect(() => {
    let handle
    let disposed = false
    wins.create({
      id: 'softpet-pet',
      url: '/softpet/window.html',
      width: 180, height: 200,
      transparent: true, frame: false, alwaysOnTop: true,
      clickThrough: true, focusable: false, rememberPosition: true,
    }).then((h) => { if (disposed) h.close(); else handle = h })
    return () => { disposed = true; handle?.close() }
  }, 'softpet: desktop window')
}
```

窗口页复用现在的 `CHARACTERS` 渲染与 CSS，状态由 host 通过 SSE 发布
`{ phase, alert, charId }`；外部全屏事件直接来自 `onFullscreenChange`。
页面内浮层作为**兜底**保留：检测不到 `desktopWindows` 时自动使用旧路径。

## 9. 里程碑建议

- **M0（1–2 天）**：`desktopWindows.create/close` + 透明置顶无边框 + 位置记忆；
  不支持穿透，先让"窗口出界"成立。
- **M1（3–5 天）**：整窗穿透 + `beginDrag` + `setBounds` + 页面消息桥。
- **M2（3–5 天）**：区域穿透、外部全屏感知、降级矩阵、权限弹窗。
- **M3**：多窗口配额、崩溃回收、跨平台 CI 截图。

## 10. 验收标准（提案侧）

1. 一个声明了 capability 的插件能创建透明置顶窗口，页面背景透明、无白底。
2. 关闭/禁用插件后 1 秒内窗口消失，无孤儿进程/窗口。
3. 穿透开启时点击落到下方应用；关闭穿透或命中热区时可交互。
4. 拖拽流畅，松手位置在重启后恢复；换显示器/DPI 不越界。
5. 外部程序全屏时窗口自动隐藏，退出后恢复，且不抢焦点。
6. 未声明 capability 的插件调用 `ctx.get('desktopWindows')` 得到 `undefined`。
7. Wayland 下返回 `degraded` 而不是崩溃。
8. 窗口页面无法导航到外部 URL，也无法访问 Node。

## 11. 需要上游确认的问题

1. 服务命名：`desktopWindows` / `overlayWindows` / `nativeWindows`？
2. 窗口内容由**宿主托管插件 HTML**，还是由插件用 `webServer` 自己起路由？
   前者更安全（无需端口/token），后者更灵活。
3. 区域穿透是否进首版？这决定桌宠能否"整窗穿透 + 局部可点"。
4. 是否允许窗口在**全屏应用之上**？建议默认禁止，仅提供"全屏时隐藏"。
5. capability 的授权粒度：按插件、按窗口、还是按会话？
6. 浏览器访问模式（非 Desktop）下，是否统一返回"不支持"，由插件降级？

## 12. 备选方案与取舍

- **伴生独立进程（WPF/Electron/Tauri）**：能立刻做出来，但不再是"插件"，
  需要单独安装、开机启动、跨平台各写一套；状态桥还要自己保证安全。
  作为上游 API 就绪前的过渡可以，但不建议作为长期方案。
- **伪造主进程 IPC**：利用未公开通道让主进程开窗。版本升级即碎，且有安全风险，
  明确不做。
- **把 DSH 主窗口改成透明置顶**：影响整个产品，不可能为单个插件开这个口子。

---

**结论**：桌面浮层是"主进程能力"，不是"页面能力"。把它做成一个有 capability、
有降级矩阵、有生命周期约束的 Host Service，成本可控，收益是整类插件
（桌宠、悬浮歌词、计时器、剪贴板助手）都能复用。
