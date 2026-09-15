import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.resolve('data');
await fs.mkdir(DATA_DIR, { recursive: true });

export async function readJson(name, fallback) {
  try { return JSON.parse(await fs.readFile(path.join(DATA_DIR, name), 'utf8')); }
  catch { return fallback; }
}

export async function writeJson(name, value) {
  const target = path.join(DATA_DIR, name);
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2));
  await fs.rename(tmp, target);
}

export async function cacheJson(relative, loader) {
  const target = path.join(DATA_DIR, 'cache', relative);
  try { return JSON.parse(await fs.readFile(target, 'utf8')); }
  catch {}
  const value = await loader();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(value));
  return value;
}
