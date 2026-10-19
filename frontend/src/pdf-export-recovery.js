// Only native-engine failures may fall back. A denied/locked destination must
// never be mistaken for permission to write elsewhere or retry a file write.
export function pdfEngineFailure(error) {
  const message = String(error?.message || error);
  return /^(?:Error:\s*)?(PDF_ENGINE_NOT_FOUND|PDF_EXPORT_TIMEOUT|PDF_EXPORT_FAILED)(?::|$)/.exec(message)?.[1] || null;
}
