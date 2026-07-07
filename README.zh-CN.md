# openstyle

> 面向 AI 的开放地图样式工具集——SLD 的 schema、编译器和提示手册，将来还可以拓展到其他格式。

[English](./README.md)

## 为什么做这个

地图样式**应该在离开模型之前就通过语法检查**。openstyle 给 AI Agent 一个约束好的 JSON shape 让它填、一个把 shape 编译成 OGC 合规 SLD 的确定性编译器、一套精挑细选的提示手册——模型不用凭记忆凑 OGC XML。

三层，一个仓库：

1. **Schema**（`@openstyle/schema`）——LLM 必须输出的 JSON 形状（附 zod 运行时校验）。精简、克制、足以表达真实制图需求（比例尺分层、属性分类、标注、符号化器）。
2. **Compiler**（`@openstyle/compiler`）——把校验过的 `StyleModel` 编译成严格的 [OGC SLD 1.0](https://docs.ogc.org/is/02-070/02-070.pdf) XML。LLM 全程不碰 `<sld:...>`。
3. **Manual + AI helpers**（`@openstyle/manual` / `@openstyle/ai`）——[GeoServer SLD Cookbook](https://docs.geoserver.org/latest/en/user/styling/sld/cookbook/) 的精简版 + 系统 prompt 生成器 + 字段引用校验器,让任何 AI Agent 都能快速上手。

## 状态

**早期 alpha**。schema 稳定之前 API 会有变动。

从 [GeoServer-AI-Style-Studio](https://github.com/gaopengbin/GeoServer-AI-Style-Studio) 抽离出来,让样式语法能独立于任何单一应用演进。

## 包一览

| 包 | 说明 |
| --- | --- |
| [`@openstyle/schema`](./packages/schema) | `StyleModel` 类型 + zod schema + 校验器 |
| [`@openstyle/compiler`](./packages/compiler) | `compileToSld` / `formatSld`——确定性 SLD 1.0 生成器 |
| [`@openstyle/manual`](./packages/manual) | 精简版 Cookbook(比例尺阶梯、调色板、few-shot) |
| [`@openstyle/ai`](./packages/ai) | 系统 prompt 构建器 + 字段引用校验 + SLD diff |

## 快速上手

```bash
pnpm add @openstyle/schema @openstyle/compiler
```

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
│   ├── manual/     # AI prompt 手册 + few-shot 库
│   └── ai/         # 系统 prompt 构建器 + 校验器
├── apps/
│   └── docs/       # VitePress 文档站
├── skills/         # Claude Code skills(sld-generator / sld-review / sld-cookbook)
├── examples/       # 端到端 demo
└── .changeset/     # 版本发布记录
```

## 开发

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
```

需要 Node ≥ 18.18、pnpm ≥ 9。

## 参考

- [OGC SLD 1.0.0 Implementation Specification (02-070)](https://docs.ogc.org/is/02-070/02-070.pdf)
- [OGC Symbology Encoding 1.1.0 (05-077r4)](https://docs.ogc.org/is/05-077r4/05-077r4.pdf)
- [GeoServer SLD Cookbook](https://docs.geoserver.org/latest/en/user/styling/sld/cookbook/)
- [GeoServer SLD Reference](https://docs.geoserver.org/latest/en/user/styling/sld/reference/)

## 贡献

见 [CONTRIBUTING.md](./CONTRIBUTING.md)。schema 稳定后欢迎 Issue 和 PR。

## 许可

MIT © 2026 gaopengbin and openstyle contributors
