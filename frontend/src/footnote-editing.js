import {codeProjection} from './projected-code.js';

// Display the body without its definition marker/continuation indentation.
// Keep original source segments so even tabs and blank lines round-trip exactly.
export function footnoteProjection(source, definition) {
  const pieces=[];let from=definition.bodyFrom;
  while(from<=definition.to) {
    const newline=source.indexOf('\n',from),to=newline<0?definition.to:Math.min(newline,definition.to);
    pieces.push({from,to});
    if(to===definition.to)break;
    pieces.push({from:to,to:to+1});from=to+1;
    const prefix=/^(?: {4}|\t)/.exec(source.slice(from,definition.to));
    if(prefix)from+=prefix[0].length;
  }
  return codeProjection(source,pieces,definition.bodyFrom,'    ');
}

export function footnoteContextIsCurrent(context, {editor,session,editing}) {
  return Boolean(context && editor && context.editor===editor && context.doc===editor.state.doc
    && context.session===session && editing && !editor.state.readOnly);
}

export function footnoteBodyEdit(definition, value) {
  const text=String(value).replace(/\r\n?/g,'\n');
  if(text===definition.text)return null;
  // Each new line remains inside this definition. In particular, an entered
  // [^name]: line must not create/overwrite an unrelated note in the document.
  return {from:definition.bodyFrom,to:definition.to,insert:text.replaceAll('\n','\n    ')};
}
