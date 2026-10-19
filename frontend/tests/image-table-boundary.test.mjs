import test from 'node:test';
import assert from 'node:assert/strict';
import {separateImageFromTable} from '../src/image-insertion-target.js';
import {findMarkdownTables} from '../src/table-designer.js';
import {buildLivePlan} from '../src/editor-live-preview.js';
const table='<!-- quillite-table-widths: 220, 220, 220 -->\n| A | B | C |\n| :--- | :--- | :--- |\n| a | b | c |\n| d | e | f |';
for(const image of ['![图](assets/a.png)','<img src="https://example.test/a.png" width="50%">','![图](data:image/png;base64,'+'A'.repeat(360000)+')']) {
  for(const [name,intro,prefix,tail] of [['plain','','',''],['quote','','> ',''],['list','- Item\n\n','  ',''],['details','<details open>\n<summary>More</summary>\n\n','','\n\n</details>']]) {
    for(const lines of [0,1,2]) test(`${name} image ${image.slice(0,35)} after table with ${lines} newlines`,()=>{
      const before=intro+table.replaceAll('\n','\n'+prefix).replace(/^/,prefix)+('\n'+prefix).repeat(lines);
      const doc=before+tail,original=findMarkdownTables(doc)[0];assert.ok(original);
      const insert=separateImageFromTable(doc,before.length,image);
      const changed=before+insert+tail,after=findMarkdownTables(changed)[0];
      assert.deepEqual(after.model,original.model);assert.equal(after.hasWidthMetadata,true);
      assert.equal(changed.slice(0,original.tableTo),doc.slice(0,original.tableTo));
      assert.equal(buildLivePlan(changed.slice(intro.length,changed.length-tail.length)).widgets.filter(w=>w.kind==='table').length,1);
      if(lines===2)assert.equal(insert,image);
    });
  }
}
test('ordinary prose, code samples, final cells and whole-table replacement stay inline',()=>{
  const image='![图](assets/a.png)';
  for(const source of ['plain','```\n'+table,table.slice(0,-1),table+'\n\nparagraph',table+'\n\n'])assert.equal(separateImageFromTable(source,source.length,image),image);
  assert.equal(separateImageFromTable(table,table.indexOf(' a ')+2,image),image);
  assert.equal(separateImageFromTable(table,0,image),image);
});
