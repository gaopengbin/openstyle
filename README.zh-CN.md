# openstyle

> 面向 AI 的开放地图样式工具集——统一地图语法、渲染适配器、受控修改与基于渲染证据的检查能力。

[English](./README.md)

## 为什么做这个

地图样式**应该在离开模型之前就通过语法检查**。openstyle 给 AI Agent 一个约束好的 JSON shape 让它填、一个把 shape 编译成 OGC 合规 SLD 的确定性编译器、一套精挑细选的提示手册——模型不用凭记忆凑 OGC XML。

地图表达、编译与创作策略分层实现：

1. **Schema**（`@openstyle/schema`）——LLM 必须输出的 JSON 形状（附 zod 运行时校验）。精简、克制、足以表达真实制图需求（比例尺分层、属性分类、标注、符号化器）。
2. **Compiler**（`@openstyle/compiler`）——把校验过的 `StyleModel` 编译成严格的 [OGC SLD 1.0](https://docs.ogc.org/is/02-070/02-070.pdf) XML。LLM 全程不碰 `<sld:...>`。
3. **Manual + AI helpers**（`@openstyle/manual` / `@openstyle/ai`）——[GeoServer SLD Cookbook](https://docs.geoserver.org/latest/en/user/styling/sld/cookbook/) 的精简版 + 系统 prompt 生成器 + 字段引用校验器,让任何 AI Agent 都能快速上手。
4. **Cartography**（`@openstyle/cartography`）——整图局部修改、支持分类与比例尺的道路描边、精简复核上下文、像素诊断和有限修复决策。截图、模型请求与项目存储由应用提供。

## 状态

**早期 alpha**。schema 稳定之前 API 会有变动。

从 [GeoServer-AI-Style-Studio](https://github.com/gaopengbin/GeoServer-AI-Style-Studio) 抽离出来,让样式语法能独立于任何单一应用演进。

## 包一览

| 包 | 说明 |
| --- | --- |
| [`@openstyle/schema`](./packages/schema) | `StyleModel` 类型 + zod schema + 校验器 |
| [`@openstyle/compiler`](./packages/compiler) | `compileToSld` / `formatSld`——确定性 SLD 1.0 生成器 |
| [`@openstyle/cartography`](./packages/cartography) | 原子地图修改、道路描边、渲染诊断与复核契约 |
| [`@openstyle/adapter`](./packages/adapter) | 渲染器能力声明与协商 |
| [`@openstyle/openlayers`](./packages/openlayers) | `compileToOpenLayers`——确定性 OpenLayers `StyleFunction` 适配器 |
| [`@openstyle/maplibre`](./packages/maplibre) | `compileOpenStyleToMapLibre`——带显式能力协商的 MapLibre Style Specification 确定性适配器 |
| [`@openstyle/manual`](./packages/manual) | 精简版 Cookbook(比例尺阶梯、调色板、few-shot) |
| [`@openstyle/ai`](./packages/ai) | 提示词、字段校验、模型请求策略与输出预算决策 |

GeoStyle 开发中可复用的创作能力已经进入本仓库源码，并由 GeoStyle 调用。0.7.0 通过 GitHub 预发布版本分发；npm 发布是独立步骤，尚未完成。见 [沉淀记录](./docs/geostyle-extraction-2026-09-08.md)、[离线工作流示例](./examples/cartography-workflow/README.md) 和 [发布说明](./docs/releasing.md)。

## 快速上手

从 [v0.7.0 发布页](https://github.com/gaopengbin/openstyle/releases/tag/v0.7.0) 下载 `openstyle-0.7.0-bundle.zip`，解压后在其目录运行 `pnpm install`。安装清单将 8 个 OpenStyle 包绑定到附带的 tarball；第三方依赖仍需网络或已有 pnpm 缓存。之后可正常导入包：

```ts
import { StyleModelSchema } from "@openstyle/schema";
import { compileToSld } from "@openstyle/compiler";

const model = StyleModelSchema.parse({
  name: "population_choropleth",
  geom: "polygon",
  classification: {
    field: "POP_DENS",
    classes: [
      { label: "低",  filter: { op: "lt",  value: 100  }, symbolizer: { kind: "polygon", fill: "#f7fbff" } },
      { label: "高", filter: { op: "gte", value: 1000 }, symbolizer: { kind: "polygon", fill: "#08306b" } },
    ],
  },
});

const sld = compileToSld(model);
// -> "<StyledLayerDescriptor ...>...</StyledLayerDescriptor>"
```

## 仓库结构

```
openstyle/
├── packages/
│   ├── schema/     # zod schema + 类型
│   ├── compiler/   # SLD 1.0 XML 生成器
│   ├── cartography/ # 受控修改、渲染证据与工作流契约
│   ├── adapter/    # 渲染器能力协商
│   ├── maplibre/   # MapLibre 整图适配器
│   ├── manual/     # AI prompt 手册 + few-shot 库
│   ├── ai/         # 系统 prompt 构建器 + 校验器
│   └── openlayers/ # OpenLayers StyleFunction 适配器
├── apps/
│   └── docs/       # VitePress 文档站
├── skills/         # Claude Code skills(sld-generator / sld-review / sld-cookbook)
├── examples/       # 端到端 demo
└── .changeset/     # 版本发布记录
```

## 开发

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
```

需要 Node ≥ 18.18，仓库固定使用 pnpm 10.32.1；发布工作流使用 Node 22。先构建再检查类型，下游包才能解析生成的类型声明。

## 参考

- [OGC SLD 1.0.0 Implementation Specification (02-070)](https://docs.ogc.org/is/02-070/02-070.pdf)
- [OGC Symbology Encoding 1.1.0 (05-077r4)](https://docs.ogc.org/is/05-077r4/05-077r4.pdf)
- [GeoServer SLD Cookbook](https://docs.geoserver.org/latest/en/user/styling/sld/cookbook/)
- [GeoServer SLD Reference](https://docs.geoserver.org/latest/en/user/styling/sld/reference/)

## 贡献

见 [CONTRIBUTING.md](./CONTRIBUTING.md)。schema 稳定后欢迎 Issue 和 PR。

## 许可

MIT © 2026 gaopengbin and openstyle contributors
