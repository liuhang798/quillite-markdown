// Wails' Windows drop handler forwards every DataTransfer item, including
// undefined entries and browser-generated Files that have no disk path.
// Keep the native path resolver for real files; contain its synchronous error.
export function guardFileDropResolver(runtime, onUnavailable = () => {}) {
  if (typeof runtime?.ResolveFilePaths !== 'function') return;
  const resolve = runtime.ResolveFilePaths;
  runtime.ResolveFilePaths = (x, y, files) => {
    const file = Array.from(files || []).find(item => item && typeof item.name === 'string' && typeof item.arrayBuffer === 'function');
    if (!file) return;
    try {
      // The application handles one dropped document/image at a time.
      return resolve.call(runtime, x, y, [file]);
    } catch (error) {
      // Do not suppress unrelated runtime failures. The caller presents a
      // safe fallback instead of treating a virtual File name as a disk path.
      return onUnavailable(file, error);
    }
  };
}
