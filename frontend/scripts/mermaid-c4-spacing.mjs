// Separate C4's generous horizontal caption spacing from its vertical padding.
// Patch only Y-placement sites; Mermaid still computes node/edge intersections.
// Smaller custom margins are preserved. Large vertical margins are capped at 32.
export function patchMermaidC4Spacing(bundle) {
  const replacements = [
    [/this\.nextData\.starty\+([\w$]+)\.margin\*2/gu, (_m,shape)=>`this.nextData.starty+Math.min(${shape}.margin,32)*2`],
    [/this\.nextData\.stopy\+([\w$]+)\.margin\*2/gu, (_m,shape)=>`this.nextData.stopy+Math.min(${shape}.margin,32)*2`],
    [/bumpLastMargin\(([\w$]+)\)\{this\.data\.stopx\+=\1,this\.data\.stopy\+=\1\}/gu, (_m,margin)=>`bumpLastMargin(${margin}){this.data.stopx+=${margin},this.data.stopy+=Math.min(${margin},32)}`],
    [/([\w$]+)\.data\.stopy\+([\w$]+)\.c4ShapeMargin,([\w$]+)\.data\.stopy/gu, (_m,bounds,config,parent)=>`${bounds}.data.stopy+Math.min(${config}.c4ShapeMargin,32),${parent}.data.stopy`],
  ];
  for (const [pattern] of replacements) {
    if ([...bundle.matchAll(pattern)].length !== 1) throw new Error('Mermaid C4 spacing changed: review the compatibility patch before packaging.');
  }
  return replacements.reduce((source,[pattern,replace])=>source.replace(pattern,replace),bundle);
}
