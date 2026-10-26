import vm from 'node:vm';
// Exercise the real async open coordinator; only DOM painting/Markdown work is
// stubbed in the focused startup, folder and file-link state-machine tests.
export function installDocumentLoadingFixture(context, source) {
  context.documentLoading = {cancel() {}, begin:()=>({phase() {},yield:async()=>{},finish() {}})};
  context.els ||= {}; context.els.content ||= {};
  context.prepareMarkdownPresentation = function*() { return {html:'fixture'}; };
  vm.runInContext(source.slice(source.indexOf('async function readDocumentForOpen('),source.indexOf('function displayDocument(')),context);
}
