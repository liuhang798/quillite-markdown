import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TEMPLATE_ADDITIONS, appendTemplateNewBadge } from '../src/template-additions.js';
import { REFERENCE_ADDITIONS } from '../../scripts/reference-additions.mjs';
import { DIAGRAM_TEMPLATES, searchDiagramTemplates } from '../src/diagram-templates.js';
import { FORMULA_TEMPLATES } from '../src/formula-templates.js';

test('picker NEW badges match reference additions for all templates in both languages', () => {
  assert.equal(TEMPLATE_ADDITIONS, REFERENCE_ADDITIONS);
  for (const [kind, templates, count] of [['diagrams', DIAGRAM_TEMPLATES, 4], ['formulas', FORMULA_TEMPLATES, 16]]) {
    for (const locale of ['zh', 'en']) {
      let badges = 0;
      for (const template of templates) {
        const name = template.name[locale];
        const label = { textContent: name, children: [], append(el) { this.children.push(el); }, ownerDocument: { createElement(tag) { assert.equal(tag, 'span'); return { setAttribute(key, value) { this[key] = value; } }; } } };
        appendTemplateNewBadge(label, kind, template.id, locale);
        assert.equal(label.textContent, name, 'template name must not be replaced');
        assert.equal(label.children.length, Number(TEMPLATE_ADDITIONS[kind].has(template.id)));
        if (label.children.length) {
          badges++;
          assert.equal(label.children[0].textContent, 'NEW');
          assert.equal(label.children[0].className, 'template-new-badge');
          assert.equal(label.children[0]['aria-label'], locale === 'en' ? 'New template' : '新增模板');
        }
      }
      assert.equal(badges, count);
    }
  }
  assert.ok(searchDiagramTemplates('data', 'calendar').every(t => TEMPLATE_ADDITIONS.diagrams.has(t.id)));
});

test('both production template lists append badges inside names without replacing engine badges', () => {
  const source = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  assert.ok(source.includes("appendTemplateNewBadge(name, 'formulas', template.id, locale)"));
  assert.ok(source.includes("appendTemplateNewBadge(label, 'diagrams', template.id, locale)"));
  assert.ok(source.includes('button.append(name, kind)'));
  assert.ok(source.includes('button.append(visualBadge)'));
});
