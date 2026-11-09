# 新形象模板 · SoftPet

复制下面的片段，改三处即可让第八位朋友出现。**不需要改状态机、CSS 或设置页。**

1. `softpet/lib/client.js` → `const CHARACTERS = [...]` 末尾追加 manifest。
2. 同文件顶部 `const CHARACTER_IDS = [...]` 加入同一个 `id`（两处必须一致，单测会检查）。
3. （可选）`visitorWeight(id, hour)` 加一行时段偏好；不加则全天均等。

---

## 1. Manifest 片段

```js
{
  id: 'pip',                                 // 唯一、稳定；写进 localStorage 后不要改
  name: { zh: '皮普', en: 'Pip' },
  intro: { zh: '我从窗台那边来。', en: 'I came from the windowsill.' },
  trait: { zh: '好奇', en: 'curious' },
  palette: {                                 // 可选；会变成 --sp-* CSS 变量
    body1: '#eaf4ef',
    body2: '#d7e9e1',
    belly: '#fbfdfb',
    earIn: '#f6d9d9',
    accent: '#9ec9b8',
    ink: '#4a5a55',
    blush: '#f4c7c7',
  },
  motion: { breath: 8.4, head: 6.2, sway: 5.4 }, // 秒；越大越慢
  svg: `<!-- 见下方骨架 -->`,
  lines: {
    head: ['唔……被摸头了。', '再一下下也可以。'],
    body: ['痒。', '你戳到我啦。'],
    tail: ['尾巴不是玩具……好吧是的。'],
    care: ['要不要一起发会儿呆？'],
  },
}
```

## 2. SVG 骨架（viewBox 200×220）

```html
<svg class="sp-svg" viewBox="0 0 200 220" width="100%" height="100%"
     aria-hidden="true" focusable="false">
  <ellipse class="sp-shadow" cx="100" cy="204" rx="46" ry="8" />

  <!-- 会随呼吸起伏的一层 -->
  <g class="sp-breathe">
    <!-- 次级摆动：呆毛 / 触角 / 尾巴 / 下摆，任选 -->
    <g class="sp-ahoge">
      <path d="M100 24 C104 12 112 10 116 4" fill="none"
            stroke="var(--sp-ink)" stroke-width="3" stroke-linecap="round" />
    </g>

    <!-- 头部：歪头与视线都挂在这里 -->
    <g class="sp-headtilt">
      <g class="sp-head">
        <ellipse cx="100" cy="112" rx="58" ry="52" fill="var(--sp-body-1)" />
        <ellipse cx="100" cy="130" rx="38" ry="30" fill="var(--sp-belly)" />

        <!-- 眼睛：sp-eye 给眨眼，sp-glint 是眼神光 -->
        <g class="sp-eyes">
          <g class="sp-eye">
            <ellipse cx="78" cy="106" rx="7" ry="9" fill="var(--sp-ink)" />
            <circle class="sp-glint" cx="80" cy="103" r="2.4" fill="#fff" />
          </g>
          <g class="sp-eye">
            <ellipse cx="122" cy="106" rx="7" ry="9" fill="var(--sp-ink)" />
            <circle class="sp-glint" cx="124" cy="103" r="2.4" fill="#fff" />
          </g>
        </g>

        <!-- 眉毛：思考 / 出错时会动 -->
        <path class="sp-brow-l" d="M68 92 q10 -5 20 -1" fill="none"
              stroke="var(--sp-ink)" stroke-width="2.4" stroke-linecap="round" />
        <path class="sp-brow-r" d="M112 91 q10 -4 20 1" fill="none"
              stroke="var(--sp-ink)" stroke-width="2.4" stroke-linecap="round" />

        <!-- 嘴：状态切换时只显示其中一个 -->
        <g class="sp-mouth">
          <path class="sp-m-smile" d="M92 132 q8 7 16 0" fill="none"
                stroke="var(--sp-ink)" stroke-width="2.6" stroke-linecap="round" />
          <path class="sp-m-small" d="M95 134 q5 4 10 0" fill="none"
                stroke="var(--sp-ink)" stroke-width="2.4" stroke-linecap="round" />
          <path class="sp-m-flat" d="M93 134 h14" fill="none"
                stroke="var(--sp-ink)" stroke-width="2.4" stroke-linecap="round" />
          <ellipse class="sp-m-o" cx="100" cy="135" rx="4" ry="5" fill="var(--sp-ink)" />
        </g>

        <!-- 腮红：摸头时淡入 -->
        <ellipse class="sp-blush" cx="64" cy="126" rx="9" ry="5" fill="var(--sp-blush)" />
        <ellipse class="sp-blush" cx="136" cy="126" rx="9" ry="5" fill="var(--sp-blush)" />
      </g>
    </g>

    <!-- 手：工具调用时会把本子举起来 -->
    <g class="sp-arm-l">
      <ellipse cx="44" cy="160" rx="10" ry="16" fill="var(--sp-body-2)" />
    </g>
    <g class="sp-arm-r">
      <ellipse cx="156" cy="160" rx="10" ry="16" fill="var(--sp-body-2)" />
    </g>

    <!-- 道具：默认透明，按状态出现 -->
    <g class="sp-notebook">…</g>
    <g class="sp-drink">…</g>

    <!-- 次级摆动：尾巴（可选） -->
    <g class="sp-tail">
      <path d="M150 168 q26 10 22 30" fill="none"
            stroke="var(--sp-body-2)" stroke-width="10" stroke-linecap="round" />
    </g>
  </g>
</svg>
```

## 3. 必须保留的 class

| class | 作用 |
| --- | --- |
| `sp-svg` | 根节点尺寸契约 |
| `sp-shadow` | 落地阴影 |
| `sp-breathe` | 呼吸起伏 |
| `sp-headtilt` / `sp-head` | 歪头 / 点头 |
| `sp-eyes` / `sp-eye` / `sp-glint` | 眨眼与眼神光 |
| `sp-brow-l` / `sp-brow-r` | 眉 |
| `sp-m-smile` / `sp-m-small` / `sp-m-flat` / `sp-m-o` | 四种嘴型 |
| `sp-blush` | 腮红 |
| `sp-arm-l` / `sp-arm-r` | 手 |
| `sp-notebook` / `sp-drink` | 工具 / 成功道具 |
| `sp-tail` / `sp-ahoge` / `sp-wisp` | 次级摆动 |
| `sp-hover` | 漂浮（可选） |
| `sp-rain` / `sp-cap` / `sp-cap-spot` | 云 / 蘑菇彩蛋（可选） |

颜色只使用 `--sp-*` 变量；不要在 SVG 里写 `<script>`、外部 `href`、`url(http…)`。

## 4. 自检

```powershell
node --check softpet/lib/client.js
node softpet-dev/test.cjs
node softpet-dev/smoke.cjs
```

- `test.cjs` 会检查七（八）只形象的 id 唯一、name/intro/trait 齐全、motion 数值有效、SVG 自包含且成对标签。
- 单只 SVG 建议 ≤8KB；所有形象都会打进同一个 client bundle。
