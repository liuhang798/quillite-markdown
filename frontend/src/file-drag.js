// Internal text/links are not file imports and must retain their editor route.
export function isFileDrag(event) {
  const transfer = event.dataTransfer;
  return Boolean(transfer && (transfer.files?.length || Array.from(transfer.types || []).includes('Files')));
}
