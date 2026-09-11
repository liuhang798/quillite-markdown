import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_MODEL_CACHE_TTL, deleteAIModelCache, readAIModelCache, writeAIModelCache } from '../src/ai-model-cache.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('model cache is isolated by provider and endpoint and removes duplicates', () => {
  const storage = memoryStorage();
  writeAIModelCache(storage, 'custom', 'https://one.example/v1', [' model-a ', 'model-a', 'model-b'], 1000);
  writeAIModelCache(storage, 'custom', 'https://two.example/v1', ['model-c'], 1200);
  assert.deepEqual(readAIModelCache(storage, 'custom', 'https://one.example/v1', 1300), { models: ['model-a', 'model-b'], savedAt: 1000 });
  assert.deepEqual(readAIModelCache(storage, 'custom', 'https://two.example/v1', 1300)?.models, ['model-c']);
});

test('expired and explicitly deleted model caches are unavailable', () => {
  const storage = memoryStorage();
  writeAIModelCache(storage, 'deepseek', 'https://api.deepseek.com', ['deepseek-v4-flash'], 1000);
  assert.equal(readAIModelCache(storage, 'deepseek', 'https://api.deepseek.com', 1001 + AI_MODEL_CACHE_TTL), null);
  deleteAIModelCache(storage, 'deepseek', 'https://api.deepseek.com');
  assert.equal(readAIModelCache(storage, 'deepseek', 'https://api.deepseek.com', 1100), null);
});
