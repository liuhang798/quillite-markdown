// Built-in candidates are not a claim about the permissions of a user's key.
// DeepSeek IDs: https://api-docs.deepseek.com/api/list-models (2026-09-11).
export const AI_MODEL_CANDIDATES = Object.freeze({
  deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  bailian: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  siliconflow: ['deepseek-ai/DeepSeek-V4-Flash', 'Pro/deepseek-ai/DeepSeek-V4'],
  openrouter: ['openrouter/auto'],
  custom: []
});

export function aiModelOptions(provider, models, selectedModel, defaultModel) {
  const clean = values => [...new Set(values.filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean))];
  const remote = clean(Array.isArray(models) ? models : []);
  // Keep an explicitly saved model, but do not mix built-in candidates into a
  // successfully loaded list (some accounts legitimately expose only one).
  return clean([selectedModel, ...(remote.length ? remote : (AI_MODEL_CANDIDATES[provider] || [defaultModel]))]);
}
