// Deliberately handles the basic class/ER grammar only. Directives, aliases,
// annotations and advanced members must stay in source mode, not be dropped.
const idPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const classRelations = ['-->', '<|--', '*--', 'o--', '..>', '..|>', '--', '..'];
const erRelations = ['||--o{', '||--|{', '||--||', '}o--o{', '|o--o{', '||..o{'];
const blank = { kind: 'entity', owner: '', name: '', dataType: '', modifier: '', target: '', relation: '', label: '', left: '', right: '' };

export function parseEntityDiagram(id, source) {
  const lines = String(source).split(/\r?\n/);
  if (lines.shift().trim() !== (id === 'class' ? 'classDiagram' : 'erDiagram')) throw new Error('unsupported-header');
  const rows = []; let owner = '';
  for (const raw of lines) {
    const line = raw.trim(); if (!line) continue;
    if (owner) {
      if (line === '}') { owner = ''; continue; }
      const match = id === 'class' ? line.match(/^([+#~-]?)(?:(\w+)\s+)?([A-Za-z_]\w*(?:\(\))?)$/) : line.match(/^(\w+)\s+(\w+)(?:\s+(PK|FK|UK))?$/);
      if (!match) throw new Error('unsupported-member');
      rows.push(id === 'class' ? { ...blank, kind: 'member', owner, modifier: match[1], dataType: match[2] || '', name: match[3] } : { ...blank, kind: 'member', owner, dataType: match[1], name: match[2], modifier: match[3] || '' });
      continue;
    }
    const entity = line.match(id === 'class' ? /^class\s+(\w+)\s*(\{)?$/ : /^(\w+)\s*\{$/);
    if (entity) { rows.push({ ...blank, owner: entity[1] }); if (entity[2] || id === 'er') owner = entity[1]; continue; }
    const relation = id === 'class'
      ? line.match(/^(\w+)(?:\s+"([\d.*]+)")?\s+(\S+)\s+(?:"([\d.*]+)"\s+)?(\w+)(?:\s*:\s*(.+))?$/)
      : line.match(/^(\w+)\s+(\S+)\s+(\w+)\s*:\s*(.+)$/);
    if (!relation) throw new Error('unsupported-relation');
    rows.push(id === 'class' ? { ...blank, kind: 'relation', owner: relation[1], left: relation[2] || '', relation: relation[3], right: relation[4] || '', target: relation[5], label: relation[6] || '' } : { ...blank, kind: 'relation', owner: relation[1], relation: relation[2], target: relation[3], label: relation[4] });
  }
  const model = { entityDiagram: id, rows, settings: {} };
  if (owner || !validateEntityDiagram(model).valid) throw new Error('unsupported-entity');
  return model;
}

export function validateEntityDiagram(model) {
  if (!model.rows.length || model.rows.length > 1000) return { valid: false, code: 'empty-rows' };
  const entities = new Set();
  for (const [row, item] of model.rows.entries()) {
    const fail = field => ({ valid: false, code: 'invalid-entity', row, field });
    if (!['entity', 'member', 'relation'].includes(item.kind)) return fail('kind');
    if (!idPattern.test(item.owner)) return fail('owner');
    if (item.kind === 'entity') { if (entities.has(item.owner)) return fail('owner'); entities.add(item.owner); }
    if (item.kind === 'member') {
      if (!(model.entityDiagram === 'class' ? /^[A-Za-z_]\w*(?:\(\))?$/ : idPattern).test(item.name)) return fail('name');
      if (!(model.entityDiagram === 'class' ? /^[A-Za-z_0-9]*$/ : /^\w+$/).test(item.dataType)) return fail('dataType');
      if (!(model.entityDiagram === 'class' ? ['', '+', '-', '#', '~'] : ['', 'PK', 'FK', 'UK']).includes(item.modifier)) return fail('modifier');
    }
    if (item.kind === 'relation') {
      if (!idPattern.test(item.target)) return fail('target');
      if (!(model.entityDiagram === 'class' ? classRelations : erRelations).includes(item.relation)) return fail('relation');
      if (/[\r\n{}"<>;`]/u.test(item.label) || (model.entityDiagram === 'er' && !item.label.trim())) return fail('label');
      if (model.entityDiagram === 'class' && (!/^[\d.*]*$/.test(item.left) || !/^[\d.*]*$/.test(item.right))) return fail('left');
    }
  }
  for (const [row, item] of model.rows.entries()) {
    if (!entities.has(item.owner) || (item.kind === 'relation' && !entities.has(item.target))) return { valid: false, code: 'missing-entity', row, field: 'owner' };
  }
  return { valid: true };
}

export function serializeEntityDiagram(model) {
  const valid = validateEntityDiagram(model); if (!valid.valid) throw Object.assign(new Error(valid.code), valid);
  const cls = model.entityDiagram === 'class';
  const lines = [cls ? 'classDiagram' : 'erDiagram'];
  for (const entity of model.rows.filter(row => row.kind === 'entity')) {
    lines.push(`    ${cls ? 'class ' : ''}${entity.owner} {`);
    for (const row of model.rows.filter(row => row.kind === 'member' && row.owner === entity.owner)) {
      lines.push(cls ? `        ${row.modifier}${row.dataType ? row.dataType + ' ' : ''}${row.name}` : `        ${row.dataType} ${row.name}${row.modifier ? ' ' + row.modifier : ''}`);
    }
    lines.push('    }');
  }
  for (const row of model.rows.filter(row => row.kind === 'relation')) lines.push(cls
    ? `    ${row.owner}${row.left ? ' "' + row.left + '"' : ''} ${row.relation} ${row.right ? '"' + row.right + '" ' : ''}${row.target}${row.label ? ' : ' + row.label : ''}`
    : `    ${row.owner} ${row.relation} ${row.target} : ${row.label}`);
  return lines.join('\n');
}

export function entityDiagramDefinition(id, locale = 'zh') {
  const en = locale === 'en', cls = id === 'class';
  const col = (key, zh, english, options) => ({ key, label: en ? english : zh, ...(options ? { type: 'select', options: options.map(item => Array.isArray(item) ? item : [item, item || '—']) } : {}) });
  return { settings: [], add: en ? 'Add row' : '添加一行', empty: { ...blank }, columns: [
    col('kind', '行类型', 'Row kind', [['entity', en ? 'Class / entity' : '类／实体'], ['member', en ? 'Field / method' : '字段／方法'], ['relation', en ? 'Relationship' : '关系']]),
    col('owner', '类／实体标识', 'Class / entity ID'), col('name', '字段／方法名', 'Field / method'), col('dataType', '字段类型', 'Data type'),
    col('modifier', cls ? '可见性' : '键', cls ? 'Visibility' : 'Key', cls ? ['', '+', '-', '#', '~'] : ['', 'PK', 'FK', 'UK']),
    col('target', '目标标识', 'Target ID'), col('relation', '关系', 'Relation', ['', ...(cls ? classRelations : erRelations)]), col('label', '关系说明', 'Relation label'),
    ...(cls ? [col('left', '来源数量', 'Source multiplicity'), col('right', '目标数量', 'Target multiplicity')] : [])
  ] };
}
