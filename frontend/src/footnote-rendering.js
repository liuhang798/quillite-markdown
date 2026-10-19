import {renderFootnoteSection} from './markdown-formats.js';
import {markdownReferenceDefinitions,decodeReferenceValue} from './reference-definitions.js';

// Footnotes are block Markdown, but their reference links/images share the
// document's definition scope. Seed the lexer before its inline pass: attaching
// links after lexing is too late because undefined references are already text.
// The caller must still sanitize this complete HTML through DOMPurify.
export function renderPreparedFootnotes(prepared, markdown, label, parseBody = null) {
  if (!prepared.notes.length) return parseBody ? parseBody(prepared.markdown) : markdown.parse(prepared.markdown);
  const references=markdownReferenceDefinitions(prepared.source,null,prepared.definitions);
  const links=Object.create(null);
  for(const [label,definition]of references)links[label]={href:definition.ref,title:definition.title?decodeReferenceValue(definition.title.slice(1,-1)):null};
  const parse=text=>{
    const lexer=new markdown.Lexer({...markdown.defaults});
    Object.assign(lexer.tokens.links,links);
    return markdown.parser(lexer.lex(text));
  };
  return (parseBody ? parseBody(prepared.markdown, links) : parse(prepared.markdown))+renderFootnoteSection(prepared.notes,parse,label);
}
