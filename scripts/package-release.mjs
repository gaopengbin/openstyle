#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const names = ['adapter', 'ai', 'cartography', 'compiler', 'manual', 'maplibre', 'openlayers', 'schema'];
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

function packedManifestEntry(tar) {
  for (let offset = 0; offset + 512 <= tar.length;) {
    const name = tar.subarray(offset, offset + 100).toString('utf8').replace(/\0.*$/, '');
    if (!name) break;
    const size = Number.parseInt(tar.subarray(offset + 124, offset + 136).toString('ascii').replace(/\0.*$/, '').trim(), 8);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length) throw new Error('Invalid packed tar entry');
    if (name === 'package/package.json') return { offset, size };
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error('Packed archive has no package/package.json');
}
function packedManifest(bytes) {
  const tar = gunzipSync(bytes);
  const { offset, size } = packedManifestEntry(tar);
  return JSON.parse(tar.subarray(offset + 512, offset + 512 + size).toString('utf8'));
}
function normalizeManifestDependencies(manifest) {
  const normalized = { ...manifest };
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const dependencies = manifest[section];
    if (dependencies !== null && typeof dependencies === 'object' && !Array.isArray(dependencies)) {
      normalized[section] = Object.fromEntries(Object.keys(dependencies).sort().map((name) => [name, dependencies[name]]));
    }
  }
  // Conditional exports/imports use key order as priority. Preserve their entire
  // subtrees, and all other manifest fields, exactly as pnpm emitted them.
  return normalized;
}
function normalizePackedTarball(bytes) {
  const tar = gunzipSync(bytes);
  const { offset, size } = packedManifestEntry(tar);
  const originalEnd = offset + 512 + Math.ceil(size / 512) * 512;
  if (originalEnd > tar.length) throw new Error('Invalid packed manifest padding');
  const manifest = JSON.parse(tar.subarray(offset + 512, offset + 512 + size).toString('utf8'));
  const content = json(normalizeManifestDependencies(manifest));
  const header = Buffer.from(tar.subarray(offset, offset + 512));
  if (header[156] !== 0 && header[156] !== 0x30) throw new Error('Packed manifest must be a regular file');
  const octalSize = content.length.toString(8);
  if (octalSize.length > 11) throw new Error('Packed manifest exceeds tar size limits');
  header.write(`${octalSize.padStart(11, '0')}\0`, 124, 12, 'ascii');
  // Tar checksums count the checksum field itself as eight ASCII spaces.
  header.fill(0x20, 148, 156);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  const paddedContent = Buffer.alloc(Math.ceil(content.length / 512) * 512);
  content.copy(paddedContent);
  // pnpm may emit dependency keys in different orders. Normalize only its
  // packed manifest; all other tar headers, data and padding remain unchanged.
  // Node's gzip header uses a zero timestamp, so retries produce the same bytes.
  return gzipSync(Buffer.concat([tar.subarray(0, offset), header, paddedContent, tar.subarray(originalEnd)]), { level: 9 });
}

// ZIP method 0 stores the already-compressed tgz files without another codec.
// Fixed metadata keeps the archive reproducible on Windows, macOS and Linux.
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function zipFiles(entries) {
  if (entries.length >= 0xffff) throw new Error('ZIP64 is not supported');
  const local = [], central = [];
  let offset = 0;
  for (const [filename, bytes] of entries) {
    const name = Buffer.from(filename);
    if (bytes.length >= 0xffffffff || offset >= 0xffffffff || name.length > 0xffff) throw new Error('ZIP64 is not supported');
    const crc = crc32(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(0x21, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(bytes.length, 18);
    header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, bytes);
    const index = Buffer.alloc(46);
    index.writeUInt32LE(0x02014b50); index.writeUInt16LE(20, 4); index.writeUInt16LE(20, 6); index.writeUInt16LE(0x800, 8);
    index.writeUInt16LE(0x21, 14); index.writeUInt32LE(crc, 16); index.writeUInt32LE(bytes.length, 20);
    index.writeUInt32LE(bytes.length, 24); index.writeUInt16LE(name.length, 28); index.writeUInt32LE(offset, 42);
    central.push(index, name);
    offset += header.length + name.length + bytes.length;
  }
  const directory = Buffer.concat(central);
  if (offset >= 0xffffffff || directory.length >= 0xffffffff) throw new Error('ZIP64 is not supported');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

async function immutableWrite(filename, bytes) {
  try {
    const existing = await readFile(filename);
    if (!existing.equals(bytes)) throw new Error(`Refusing to replace a different release artifact: ${path.basename(filename)}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, bytes, { flag: 'wx' });
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 2 && args[0] === '--version' && semver.test(args[1]))) throw new Error('Usage: pnpm release:pack [--version 0.7.0]');
  const pnpm = process.env.npm_execpath;
  if (!pnpm || !/pnpm/i.test(pnpm)) throw new Error('Run this through pnpm release:pack so npm_execpath identifies the pnpm CLI.');
  const nodePnpm = /\.(?:c?js|mjs)$/i.test(pnpm);
  const workspace = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const packages = await Promise.all(names.map(async (directory) => ({ directory, manifest: JSON.parse(await readFile(path.join(root, 'packages', directory, 'package.json'), 'utf8')) })));
  const version = args[1] ?? packages[0].manifest.version;
  if (!semver.test(version) || packages.some(({ manifest, directory }) => manifest.private || manifest.name !== `@openstyle/${directory}` || manifest.version !== version)) {
    throw new Error(`All eight public packages must have the same requested version: ${packages.map(({ manifest }) => `${manifest.name}@${manifest.version}`).join(', ')}`);
  }
  const publicNames = new Set(packages.map(({ manifest }) => manifest.name));
  for (const { directory, manifest } of packages) {
    for (const file of ['dist/index.js', 'dist/index.cjs', 'dist/index.d.ts']) await readFile(path.join(root, 'packages', directory, file));
    for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) for (const dependency of Object.keys(manifest[section] ?? {})) {
      if (dependency.startsWith('@openstyle/') && !publicNames.has(dependency)) throw new Error(`Missing bundled dependency ${dependency}`);
    }
  }

  const destination = path.join(root, 'artifacts', 'releases', `v${version}`);
  await mkdir(destination, { recursive: true });
  const temporary = await mkdtemp(path.join(destination, '.pack-'));
  try {
    const files = [];
    for (const { directory, manifest } of packages) {
      // pnpm resolves workspace:* in packed manifests; do not rewrite source files.
      execFileSync(nodePnpm ? process.execPath : pnpm, [...(nodePnpm ? [pnpm] : []), 'pack', '--pack-destination', temporary], {
        cwd: path.join(root, 'packages', directory), windowsHide: true,
        env: { ...process.env, npm_config_ignore_scripts: 'true' }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      const filename = `${manifest.name.slice(1).replace('/', '-')}-${version}.tgz`;
      const bytes = normalizePackedTarball(await readFile(path.join(temporary, filename)));
      const packed = packedManifest(bytes);
      if (packed.name !== manifest.name || packed.version !== version) throw new Error(`Packed identity mismatch: ${filename}`);
      for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) for (const [dependency, range] of Object.entries(packed[section] ?? {})) {
        if (typeof range === 'string' && range.startsWith('workspace:')) throw new Error(`Unresolved workspace dependency in ${filename}`);
        if (dependency.startsWith('@openstyle/') && (!publicNames.has(dependency) || range !== version)) throw new Error(`Unbundled or nonmatching internal dependency in ${filename}: ${dependency}@${range}`);
      }
      files.push([filename, bytes]);
    }
    if ((await readdir(temporary)).filter((file) => file.endsWith('.tgz')).length !== 8) throw new Error('Expected exactly eight package tarballs');
    const dependencies = Object.fromEntries(packages.map(({ manifest }) => [manifest.name, `file:./tarballs/${manifest.name.slice(1).replace('/', '-')}-${version}.tgz`]));
    const bundleReadme = Buffer.from(`# OpenStyle ${version} distribution bundle\n\nThis bundle includes all eight @openstyle packages. It does not publish them to npm.\n\n1. Verify SHA256SUMS using sha256sum --check SHA256SUMS (or a SHA-256 tool on Windows).\n2. From this directory run pnpm install, then import the @openstyle packages normally.\n\nThe private package.json uses local file dependencies and pnpm.overrides for every internal package, so unpublished @openstyle versions are never required from npm. Keep the tarballs directory and these overrides together when adapting this to another project. Use pnpm, not npm/yarn, for this bundle's override contract.\n\nThird-party dependencies such as zod and renderer peers ol/maplibre-gl are NOT embedded. Installation needs access to those dependencies or a previously populated pnpm store; pnpm install --offline only works with that cache. This is offline distribution of OpenStyle, not a fully vendored dependency tree.\n\nThis release is a prerelease. See https://github.com/gaopengbin/openstyle for source, license, API documentation and limitations.\n`);
    const bundle = [
      ['package.json', json({ name: 'openstyle-local-distribution', version, private: true, type: 'module', packageManager: workspace.packageManager, dependencies, pnpm: { overrides: { ...dependencies } } })],
      ['README.md', bundleReadme],
      ...files.map(([filename, bytes]) => [`tarballs/${filename}`, bytes]),
    ];
    bundle.push(['SHA256SUMS', Buffer.from(bundle.map(([filename, bytes]) => `${sha256(bytes)}  ${filename}\n`).join(''))]);
    const zipName = `openstyle-${version}-bundle.zip`;
    const zip = zipFiles(bundle.map(([filename, bytes]) => [`openstyle-${version}-bundle/${filename}`, bytes]));
    const releaseFiles = [...files, [zipName, zip]];
    const sums = Buffer.from(releaseFiles.map(([filename, bytes]) => `${sha256(bytes)}  ${filename}\n`).join(''));
    for (const [filename, bytes] of releaseFiles) await immutableWrite(path.join(destination, filename), bytes);
    for (const [filename, bytes] of bundle) await immutableWrite(path.join(destination, 'bundle', filename), bytes);
    await immutableWrite(path.join(destination, 'SHA256SUMS'), sums);
    console.log(JSON.stringify({ version, packages: files.length, destination: path.relative(root, destination), assets: [...releaseFiles.map(([filename]) => filename), 'SHA256SUMS'], bundle: 'bundle/' }, null, 2));
  } finally {
    const resolved = path.resolve(temporary);
    if (path.dirname(resolved) !== path.resolve(destination) || !path.basename(resolved).startsWith('.pack-')) throw new Error('Unsafe temporary cleanup path');
    await rm(resolved, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : 'Release packaging failed'); process.exitCode = 1; });
