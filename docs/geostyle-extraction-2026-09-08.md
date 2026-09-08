# GeoStyle 创作能力沉淀到 OpenStyle

日期：2026-09-08。以下记录保留当日提取与验收状态：代码进入 OpenStyle 本地工作区，GeoStyle 改为消费共享实现，当时尚未提交、发布 npm 或部署线上。

发布跟进（2026-09-09）：共享能力已整理并提交到 `codex/release-0.7.0` 发布分支。0.7.0 采用 GitHub 预发布 ZIP 和八个 tarball 分发，npm 发布尚未完成；安装方式和发布验收见 [0.7.0 发布说明](./releases/v0.7.0.md)。下文的测试数量与浏览器记录属于 9 月 8 日的提取验收，不代表最终发布套件数量。

## 本轮成果

此前应用已经复用了 OpenStyle 语法、StyleProfile 和渲染编译器，但局部修改、质量判断及模型参数策略仍写在 GeoStyle 内。本轮把这些可复用行为提取为公共包接口，应用保留运行环境适配。

| 能力 | OpenStyle 公共接口 | GeoStyle 消费位置 |
| --- | --- | --- |
| 原子局部修改与变更摘要 | `@openstyle/cartography`: `applyOpenStylePatch`, `OpenStylePatchSchema` | `lib/background/map-patch.ts` |
| 分类、比例尺和隐藏状态一致的道路描边 | `applyLineCasing`, `LineCasingSchema` | `lib/styles/line-casing.ts` |
| 真实图层摘要与派生描边配对 | `summarizeOpenStyle` | `currentStyleSummary` 适配为应用字段 |
| 精简视觉复核上下文 | `buildMapReviewContext` | `lib/background/map-review-context.ts` |
| RGBA 覆盖率、亮度对比、色度与边缘密度 | `measureRenderPixels`, `visualWarningsForMetrics` | `lib/instant/render-pixel-metrics.ts` |
| 结构检查、视觉复核需求与有限修复决策 | `structuralRenderReview`, `needsVisionReview`, `mayRepair` | `lib/background/map-quality.ts` |
| 模型覆盖、输出上限与 thinking 参数策略 | `@openstyle/ai`: `rewriteChatRequestBody`, `readPositiveInteger`, `readThinkingMode` | `lib/server/llm-proxy-policy.ts` |
| 不保留模型文本的执行摘要与连续输出耗尽判断 | `summarizeModelStep`, `nextOutputBudgetState` | `lib/background/server-agent-runner.ts` |

公共 API 从包根导出，构建提供 ESM、CJS 和类型声明。原有 cartography 契约、AI 提示词与验证接口保留。新增行为当时分别记录在 changeset，现已纳入 0.7.0 包版本与 changelog。

## 修改与复核边界

`applyOpenStylePatch` 接受规范 OpenStyle、真实数据源 profile、补丁和调用方生成的新版本 ID。它校验目标旧版本、数据源与唯一图层绑定，限制字段路径，校验标签/分类字段与几何类型；全部操作通过后才返回新对象，不修改输入。应用元数据、未修改资源和图层身份保留。未知路径、独立同名 underlay、新外部图片、无变化修改和过期版本会被拒绝。

描边是同源的下层线样式，每侧额外宽度明确；分类、比例尺、透明度、隐藏状态随线芯保留，标签不重复。共享摘要只合并经内容验证的派生描边，不凭名称覆盖独立线层。

像素诊断不依赖 DOM。应用负责真实截图解码，并为库不直接识别的 CSS 颜色提供解析器。结构检查假定样式已通过 schema 校验，像素阈值只是诊断，不代表美学或视觉模型验收；`pending`、`not-reviewed` 不转换为视觉通过。运行态 `RenderQualityReport` 和持久化 `ReviewReport` 是不同契约。

模型策略不读取环境变量、持有密钥或发起网络请求。模型调用方传入配置和每步元数据，库返回请求策略与停止决策。`nextOutputBudgetState` 在连续两次输出耗尽且没有工具调用时要求停止；出现工具调用或其他结束原因会重置连续计数。

账号、额度、SDK、HTTP、取消、队列、任务持久化、页面交互、截图与真实视觉模型调用继续由 GeoStyle 负责。完整 Agent 服务端执行器没有迁入 OpenStyle。

## 消费集成与兼容修复

GeoStyle 的全部 `@openstyle/*` 依赖统一指向相邻源码包的构建产物，不再混用 AI/compiler 的旧 tarball。安装后已逐字节验证 cartography/ai 的消费产物与库产物相同；锁文件保持本轮开始时的其他依赖版本。

GeoStyle 的工具输入仍使用应用的 Zod 4 schema，库内部使用其自身 Zod 3 校验。薄适配层负责地理范围、`baseBundleId` → `baseStyleId`、`createdBy`、时间戳及渲染器能力编译，领域算法没有继续复制到应用。

严格数据源检查暴露了导入/分享后的兼容问题：复制数据集生成新 sourceRef，但原图层仍引用旧 sourceRef。已在 GeoStyle 的可信复制路径同步重绑定**恰好匹配旧引用**的图层；导入同时处理当前、past、future 各自数据源，其他源与未绑定图层保留。共享库的严格校验未放宽。

## 可运行示例与回归资产

- [离线示例](../examples/cartography-workflow/README.md)：从已构建公共入口调用真实样式重放、道路描边、两个渲染器编译、像素校准和模型策略。
- `packages/cartography/test/fixtures/linyi-water.json`：临沂水体/水道改色，2 个图层、5 个字段；结果与已接受的 canonical 样式完全相同。
- `packages/cartography/test/fixtures/new-york-casing.json`：纽约道路描边修改，1 个图层、1 个字段；结果与已接受的 canonical 样式完全相同。
- 夹具保留 OSM / ODbL 来源说明；补丁由此前已记录的变化和前后样式重建，不宣称保存了模型原始响应。没有复制要素数据、会话、账户或凭据。
- 示例生成 `examples/cartography-workflow/output/report.json`（忽略的本地产物）。合成像素校准和 OpenLayers selector probe 明确标注为合成输入，不冒充真实地图渲染证据。

从 OpenStyle 根目录运行：

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm docs:build
node examples/cartography-workflow/run.mjs --write
```

应用更新共享代码后：先在 OpenStyle 构建，然后在 GeoStyle 执行 `pnpm install --frozen-lockfile` 刷新本地 `file:` 副本并重启开发服务。`--offline --ignore-scripts` 可在依赖缓存齐全时使用，本轮已验证；不要使用 `--force` 扩大到未缓存的其他平台可选依赖。

## 本轮验证

| 验证 | 结果 |
| --- | --- |
| OpenStyle 全库测试 | 193 项通过，其中 cartography 68、AI 78 |
| OpenStyle 类型与八个包的 ESM/CJS/声明构建 | 通过 |
| OpenStyle VitePress 文档站构建 | 通过 |
| 公共 API 离线示例与 README 补丁代码 | 通过；零模型请求 |
| GeoStyle 全量测试 | 75 文件、650 项通过 |
| GeoStyle TypeScript | `tsc --noEmit --incremental false` 通过 |
| GeoStyle 改动文件 ESLint | 14 个文件通过；全目录命令会扫描多个自定义 `.next-*` 产物，已停止并改用源码范围检查 |
| GeoStyle 生产 Webpack 构建 | `.next-creation-build` 构建成功，62 个静态生成任务完成 |
| 浏览器恢复检查 | 后台恢复已有纽约项目，地图道路/建筑/标签与会话可见，显示已保存，控制台 error 为 0 |

浏览器检查只恢复已有地图，没有重新调用模型，也没有重做整套账号或发布验收。已有会话的历史超时和待检查状态保留。本轮未修改线上配置或公开站点。

两个仓库开始时都已有未提交功能和并行 GeoD 改动，本轮保留这些内容，没有整体重置或混合提交。后续在独立发布工作树整理版本和提交，原工作树保留；OpenStyle 包分发与 GeoStyle 网站部署仍是不同流程。
