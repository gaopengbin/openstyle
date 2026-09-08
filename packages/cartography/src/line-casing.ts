import { StyleModelSchema, type LineSymbolizer, type StyleModel } from "@openstyle/schema";
import { z } from "zod";

/** Width is the additional stroke width on each side of the unchanged core. */
export const LineCasingSchema = z.object({
  color: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/),
  width: z.number().finite().positive().max(6),
}).strict();
export type LineCasingOptions = z.infer<typeof LineCasingSchema>;

function transparentStroke(color: string) {
  const value = color.trim().toLowerCase();
  return value === "transparent" || value === "none"
    || /^#[0-9a-f]{3}0$/.test(value) || /^#[0-9a-f]{6}00$/.test(value)
    || /^(?:rgba|hsla)\([^)]*,\s*0(?:\.0+)?%?\s*\)$/.test(value)
    || /^(?:rgb|rgba|hsl|hsla)\([^)]*\/\s*0(?:\.0+)?%?\s*\)$/.test(value);
}

/** Derive a lower line pass without modifying the core, its rules, or caller metadata. */
export function applyLineCasing<T extends StyleModel>(style: T, options: LineCasingOptions): Omit<T, "label"> {
  const casing = LineCasingSchema.parse(options);
  StyleModelSchema.parse(style);
  if (style.geom !== "line") throw new Error("Line casing only accepts line StyleModels.");
  const model = structuredClone(style);
  delete model.label;
  const stroke = (symbolizer: NonNullable<StyleModel["symbolizer"]>): LineSymbolizer => {
    if (symbolizer.kind !== "line") throw new Error("Every line casing symbolizer must be a line.");
    return {
      ...symbolizer,
      stroke: casing.color,
      strokeWidth: transparentStroke(symbolizer.stroke) ? 0
        : symbolizer.strokeWidth === 0 || symbolizer.strokeOpacity === 0 ? symbolizer.strokeWidth
          : symbolizer.strokeWidth + 2 * casing.width,
    };
  };
  if (model.symbolizer) model.symbolizer = stroke(model.symbolizer);
  if (model.classification) {
    model.classification.classes = model.classification.classes.map((entry) => ({ ...entry, symbolizer: stroke(entry.symbolizer) }));
    if (model.classification.fallback) model.classification.fallback = stroke(model.classification.fallback);
  }
  StyleModelSchema.parse(model);
  return model;
}
