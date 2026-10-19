// One explicit batch shared by the template picker and generated references.
// Replace these IDs together when highlighting a later batch of additions.
export const TEMPLATE_ADDITIONS = {
  date: '2026-10-13',
  diagrams: new Set(['histogram-chart', 'percent-bar-chart', 'horizontal-bar-chart', 'calendar-chart']),
  formulas: new Set([
    'trig-identity', 'tangent-identity', 'angle-addition', 'double-angle',
    'set-union', 'set-membership', 'set-builder', 'logic-quantifiers', 'logic-implication',
    'aligned-derivation', 'system3', 'sample-covariance', 'standard-error',
    'mean-confidence', 'poisson', 'linear-regression',
  ]),
};

export function appendTemplateNewBadge(label, kind, id, locale) {
  if (!TEMPLATE_ADDITIONS[kind]?.has(id)) return;
  const badge = label.ownerDocument.createElement('span');
  badge.className = 'template-new-badge';
  badge.textContent = 'NEW';
  badge.title = locale === 'en' ? 'New template' : '新增模板';
  badge.setAttribute('aria-label', badge.title);
  label.append(badge);
}
