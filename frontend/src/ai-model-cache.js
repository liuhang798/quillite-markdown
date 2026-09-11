const STORAGE_KEY = 'quillite.ai-model-cache.v1';
export const AI_MODEL_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 12;

const cacheID = (provider, baseUrl) => `${String(provider || '').trim()}\n${String(baseUrl || '').trim()}`;
const cleanModels = models => [...new Set((Array.isArray(models) ? models : []).filter(model => typeof model === 'string').map(model => model.trim()).filter(Boolean))].slice(0, 200);

function readCache(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function readAIModelCache(storage, provider, baseUrl, now = Date.now()) {
  const entry = readCache(storage)[cacheID(provider, baseUrl)];
  if (!entry || !Number.isFinite(entry.savedAt) || now - entry.savedAt > AI_MODEL_CACHE_TTL) return null;
  const models = cleanModels(entry.models);
  return models.length ? { models, savedAt: entry.savedAt } : null;
}

export function writeAIModelCache(storage, provider, baseUrl, models, now = Date.now()) {
  const clean = cleanModels(models);
  if (!storage || !clean.length) return;
  const cache = readCache(storage);
  cache[cacheID(provider, baseUrl)] = { models: clean, savedAt: now };
  const trimmed = Object.fromEntries(Object.entries(cache).sort((a, b) => (b[1]?.savedAt || 0) - (a[1]?.savedAt || 0)).slice(0, MAX_CACHE_ENTRIES));
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Model caching is optional; storage restrictions must not block AI use.
  }
}

export function deleteAIModelCache(storage, provider, baseUrl) {
  if (!storage) return;
  const cache = readCache(storage);
  delete cache[cacheID(provider, baseUrl)];
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore unavailable browser storage.
  }
}
