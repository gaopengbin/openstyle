import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import {
  applyOpenStylePatch,
  applyLineCasing,
  summarizeOpenStyle,
  measureRenderPixels,
  visualWarningsForMetrics,
  structuralRenderReview,
  needsVisionReview,
  mayRepair,
  buildMapReviewContext,
} from '../../packages/cartography/dist/index.js';
import { rewriteChatRequestBody } from '../../packages/ai/dist/index.js';
import { compileOpenStyleToOpenLayers } from '../../packages/openlayers/dist/index.js';
import { compileOpenStyleToMapLibre } from '../../packages/maplibre/dist/index.js';

// These dist entry points are the same modules exposed by each package's
// public `exports.import`. No source/private entry points or extra dependencies.
const directory = new URL('./', import.meta.url);
const shouldWrite = process.argv.slice(2).includes('--write');
if (process.argv.slice(2).some((argument) => argument !== '--write')) throw new Error('Usage: node examples/cartography-workflow/run.mjs [--write]');
let networkAttempts = 0;
globalThis.fetch = async () => {
  networkAttempts += 1;
  throw new Error('This example must not perform network requests.');
};

const outputs = [];
const cases = [];
// Recovering an existing casing subtracts two floating-point stroke widths.
// Compare only derived widths at the same 1e-6 precision as the public summary;
// all other style fields and the accepted patch result remain exact checks.
const comparableCasing = (style) => JSON.parse(JSON.stringify(style, (key, value) => key === 'strokeWidth' && typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value));
for (const name of ['linyi-water', 'new-york-casing']) {
  // These fixtures contain real accepted before/after styles and reconstructed
  // patches. They deliberately contain no source features, pixels or credentials.
  const fixture = JSON.parse(await readFile(new URL(`../../packages/cartography/test/fixtures/${name}.json`, directory), 'utf8'));
  const unchangedInput = structuredClone(fixture.input);
  const result = applyOpenStylePatch(fixture.input);
  assert.deepEqual(fixture.input, unchangedInput, 'Applying a patch must not mutate its input');
  assert.deepEqual(result.style, fixture.expected, 'The public API must reproduce the accepted real edit');

  // Every patch remains bound to both its original style and its data source.
  assert.throws(() => applyOpenStylePatch({ ...fixture.input, patch: { ...fixture.input.patch, baseStyleId: 'stale-style' } }), /older style/);
  assert.throws(() => applyOpenStylePatch({ ...fixture.input, patch: { ...fixture.input.patch, sourceId: 'another-source' } }), /scope/);

  const summary = summarizeOpenStyle(result.style);
  const road = summary.layers.find((layer) => layer.sourceLayers.includes('transportation') && layer.casing);
  assert.ok(road?.casing && road.underlayId, 'The real road casing must be recoverable');
  const core = result.style.layers.find((layer) => layer.id === road.layerId);
  const underlay = result.style.layers.find((layer) => layer.id === road.underlayId);
  assert.ok(core && underlay);
  const originalCore = structuredClone(core.style);
  const derivedUnderlay = applyLineCasing(core.style, road.casing);
  assert.deepEqual(core.style, originalCore, 'Deriving a casing must not change its core');
  assert.deepEqual(comparableCasing(derivedUnderlay), comparableCasing(underlay.style), 'The derived lower stroke must match the real fixture');
  assert.equal(derivedUnderlay.label, undefined, 'A casing must not duplicate labels');

  // Compilers run offline. This probe checks style selection and stroke width;
  // it is intentionally a synthetic feature, not fetched geographic data.
  const openLayers = compileOpenStyleToOpenLayers(result.style);
  const probe = {
    get: (field) => ({ layer: 'transportation', class: 'primary', name: 'Synthetic selector probe' })[field],
    getGeometry: () => ({ getType: () => 'LineString' }),
  };
  const probeStyles = openLayers.styleFunction(probe, 1);
  assert.ok(Array.isArray(probeStyles) && probeStyles.length === 2);
  const strokeWidths = probeStyles.map((style) => style.getStroke()?.getWidth());
  assert.ok(strokeWidths.every(Number.isFinite));
  assert.ok(Math.abs(strokeWidths[0] - strokeWidths[1] - 2 * road.casing.width) < 1e-6);
  assert.ok(probeStyles[0].getZIndex() < probeStyles[1].getZIndex());

  const mapLibre = compileOpenStyleToMapLibre(result.style, {
    sourceData: { type: 'FeatureCollection', features: [] },
    glyphs: '/local-glyphs/{fontstack}/{range}.pbf',
  });
  const underlayIndex = mapLibre.style.layers.findIndex((layer) => layer.id === `${underlay.id}-class-0`);
  const coreIndex = mapLibre.style.layers.findIndex((layer) => layer.id === `${core.id}-class-0`);
  assert.ok(underlayIndex >= 0 && coreIndex > underlayIndex);
  const underlayWidth = mapLibre.style.layers[underlayIndex].paint['line-width'];
  const coreWidth = mapLibre.style.layers[coreIndex].paint['line-width'];
  assert.ok(Math.abs(underlayWidth - coreWidth - 2 * road.casing.width) < 1e-6);

  const reviewContext = buildMapReviewContext({
    style: result.style,
    userIntent: name === 'linyi-water' ? 'Change only the water colors.' : 'Make the existing road casing two pixels wider on each side.',
    locale: 'en-US',
    dataset: { location: name, layers: fixture.input.profile.layers },
    changes: result.changeSummary,
  });
  const request = {
    model: 'caller-model',
    max_tokens: 4096,
    max_completion_tokens: 4096,
    messages: [{ role: 'user', content: JSON.stringify(reviewContext) }],
    tools: [{ type: 'function', function: { name: 'submit_review', parameters: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] } } }],
    stream: true,
  };
  const policy = rewriteChatRequestBody(JSON.stringify(request), {
    modelOverride: 'deepseek-v4-flash', maxOutputTokens: 2048, thinkingMode: 'disabled',
  });
  const prepared = JSON.parse(policy.body);
  assert.equal(prepared.model, 'deepseek-v4-flash');
  assert.equal(prepared.max_tokens, 2048);
  assert.equal(prepared.max_completion_tokens, 2048);
  assert.deepEqual(prepared.thinking, { type: 'disabled' });
  assert.deepEqual(prepared.messages, request.messages);
  assert.deepEqual(prepared.tools, request.tools);
  assert.equal(prepared.stream, true);
  const unsupportedThinking = JSON.parse(rewriteChatRequestBody(policy.body, { modelOverride: 'example-without-thinking-extension', thinkingMode: 'enabled' }).body);
  assert.equal(unsupportedThinking.thinking, undefined, 'Provider-specific thinking parameters must not leak to unsupported models');

  // A compiled style does not establish a successful map render. These fixtures
  // have no geometry/pixels. Exercise the missing-evidence guard explicitly.
  const missingEvidence = structuralRenderReview({ bundleId: result.style.id, renderedFeatures: 0 }, result.changeSummary, { reviewedAt: '2026-09-08T00:00:00.000Z' });
  assert.equal(missingEvidence.render, 'failed');
  assert.equal(missingEvidence.visual, 'needs-repair');
  assert.equal(mayRepair(missingEvidence, 0), false, 'Missing data cannot be fixed by restyling');

  outputs.push([`${name}.openstyle.json`, result.style], [`${name}.maplibre-compile.json`, mapLibre]);
  cases.push({
    name,
    provenance: fixture.provenance,
    canonicalLayers: result.style.layers.length,
    changedLayers: result.changeSummary.changedLayerIds,
    changedFields: result.changeSummary.changedFields.length,
    exactAcceptedResult: true,
    sourceAndVersionGuards: true,
    casing: { color: road.casing.color, extraWidthPerSide: Math.round(road.casing.width * 1e6) / 1e6, corePreserved: true },
    compilation: {
      openLayers: { selectorProbeStrokeWidths: strokeWidths, warnings: openLayers.warnings },
      mapLibre: { layers: mapLibre.style.layers.length, underlayBeforeCore: true, warnings: mapLibre.warnings },
    },
    quality: { needsVisionByChangeExtent: needsVisionReview(result.changeSummary), missingEvidence: { render: missingEvidence.render, visual: missingEvidence.visual, repairAllowed: false } },
    preparedRequestPolicy: { model: policy.resolvedModel, maxOutputTokens: policy.effectiveMaxOutputTokens, thinkingMode: policy.thinkingMode, sent: false },
  });
}

// A deterministic calibration image demonstrates the metric API. It is not a
// screenshot of either map and is never used as their visual acceptance evidence.
const rgba = new Uint8ClampedArray(8 * 8 * 4);
for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) rgba.set(x < 4 ? [10, 80, 180, 255] : [255, 255, 255, 255], (y * 8 + x) * 4);
const metrics = measureRenderPixels({ data: rgba, width: 8, height: 8, background: 'paper-white', sampleStep: 1, parseColor: (value) => value === 'paper-white' ? [255, 255, 255] : null });
assert.deepEqual(metrics, { schemaVersion: '0.1', sampleCount: 64, inkRatio: 0.5, luminanceContrast: 0.7176, meanChroma: 0.3333, edgeDensity: 0.0714 });
assert.deepEqual(visualWarningsForMetrics(metrics), []);
assert.equal(networkAttempts, 0);

const report = {
  schemaVersion: '1.0',
  success: true,
  cases,
  pixelCalibration: { input: 'Synthetic 8 × 8 RGBA calibration buffer; not map render evidence', metrics, warnings: visualWarningsForMetrics(metrics) },
  boundaries: { networkRequests: networkAttempts, modelRequests: 0, browserRendering: false, visualAcceptance: false },
};
if (shouldWrite) {
  const output = new URL('output/', directory);
  await mkdir(output, { recursive: true });
  for (const [filename, value] of [...outputs, ['report.json', report]]) await writeFile(new URL(filename, output), `${JSON.stringify(value, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
