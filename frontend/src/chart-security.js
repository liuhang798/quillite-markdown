// Chart JSON is document content, not trusted application configuration.
// ECharts deliberately exposes HTML and URL APIs; close those executable paths
// before options reach any renderer (preview, validation, or export).
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export function secureChartOption(option) {
  const stack = [{ value: option, scope: 'config' }];
  while (stack.length) {
    const { value, scope } = stack.pop();
    if (!value || typeof value !== 'object') continue;
    // JSON data can have columns named link, constructor, tooltip, etc. They
    // are not ECharts configuration. Only __proto__ is unsafe in both scopes.
    delete value.__proto__;
    if (scope !== 'data') sanitizeConfiguration(value);
    for (const key of Object.keys(value)) {
      const child = value[key];
      if (!child || typeof child !== 'object') continue;
      let childScope = 'config';
      if (scope === 'data' || Array.isArray(value)) childScope = scope;
      else if ((scope === 'dataset' && key === 'source') || key === 'value' || key === 'encode' || key === 'dimensions') childScope = 'data';
      else if (key === 'dataset') childScope = 'dataset';
      stack.push({ value: child, scope: childScope });
    }
  }
  return option;
}

function sanitizeConfiguration(value) {
  for (const key of ['prototype', 'constructor']) delete value[key];
  for (const key of ['link', 'sublink']) {
    if (!(key in value)) continue;
    try {
      const url = new URL(value[key]);
      if (!['https:', 'http:'].includes(url.protocol)) delete value[key];
    } catch { delete value[key]; }
  }
  if (value.tooltip && typeof value.tooltip === 'object') {
    value.tooltip.renderMode = 'richText';
    delete value.tooltip.extraCssText;
  }
  const dataView = value.feature?.dataView;
  if (dataView && typeof dataView === 'object') {
    if (dataView.title != null) dataView.title = escapeHTML(dataView.title);
    if (Array.isArray(dataView.lang)) dataView.lang = dataView.lang.map(escapeHTML);
    delete dataView.optionToContent;
    delete dataView.contentToOption;
  }
  // Untrusted regex transforms run synchronously and can freeze the WebView.
  // Reject rather than silently change the meaning of a chart filter.
  if (value.type === 'filter' && value.config) {
    const filters = [value.config];
    while (filters.length) {
      const filter = filters.pop();
      if (!filter || typeof filter !== 'object') continue;
      if (Object.prototype.hasOwnProperty.call(filter, 'reg')) throw new Error('Regular-expression chart filters are not supported for untrusted documents.');
      // Do not spread unbounded document data into function arguments.
      for (const child of Object.values(filter)) {
        if (child && typeof child === 'object') filters.push(child);
      }
    }
  }
}
