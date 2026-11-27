const supportedSidebarModes = new Set(['recent', 'favorites', 'explorer']);

export const DEFAULT_RECENT_LIMIT = 100;

export function normalizeSidebarMode(mode) {
  return supportedSidebarModes.has(mode) ? mode : 'recent';
}

export function isWindowsDocumentPath(path) {
  const platform=globalThis.document?.documentElement?.dataset?.platform;
  return platform==='windows' || ((!platform || platform==='browser') && /^(?:[a-z]:[\\/]|[\\/]{2})/i.test(path));
}

export function normalizeDocumentPath(filePath) {
  const path=String(filePath || '');
  // A backslash and differently cased names are distinct on POSIX.
  return (isWindowsDocumentPath(path) ? path.replace(/\\/g,'/').toLowerCase() : path).replace(/\/+$/,'');
}

export function sameDocumentPath(left, right) {
  const leftPath = normalizeDocumentPath(left);
  const rightPath = normalizeDocumentPath(right);
  return Boolean(leftPath && rightPath && leftPath === rightPath);
}

// A document can legitimately disappear after it was added to Recent (for
// example, a chat-app cache was cleaned or the file was moved in Finder). This
// is a library-state change, not an application failure that should be sent to
// error telemetry.
export function isMissingDocumentError(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /(?:no such file or directory|not a directory|file does not exist|the file doesn['’]t exist|cannot find the file specified|cannot find the path specified|the system cannot find the (?:file|path) specified|path does not exist|系统找不到指定的文件|系统找不到指定的路径|找不到指定的文件|文件不存在)/i.test(message);
}

function pathFromRecentEntry(entry) {
  return typeof entry === 'string' ? entry : entry?.path;
}

// Preferences replace the favorites array. Reuse membership until it changes.
const favoriteMembership = new WeakMap();
export function isLibraryFavorite(files, path) {
  let keys = favoriteMembership.get(files);
  if (!keys) {
    keys = new Set(files.map(file => normalizeDocumentPath(file.path)));
    favoriteMembership.set(files, keys);
  }
  return keys.has(normalizeDocumentPath(path));
}

function uniqueRecentFiles(recentFiles = []) {
  const seen = new Set();

  return recentFiles.filter(file => {
    const normalizedPath = normalizeDocumentPath(pathFromRecentEntry(file));
    if (!normalizedPath || seen.has(normalizedPath)) return false;
    seen.add(normalizedPath);
    return true;
  });
}

function normalizeRecentLimit(ordinaryLimit) {
  const value = Number(ordinaryLimit);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : DEFAULT_RECENT_LIMIT;
}

export function normalizePinnedRecentPaths(recentFiles = [], pinnedPaths = []) {
  const filePathByNormalizedPath = new Map();
  uniqueRecentFiles(recentFiles).forEach(file => {
    const filePath = pathFromRecentEntry(file);
    filePathByNormalizedPath.set(normalizeDocumentPath(filePath), filePath);
  });

  const seen = new Set();
  return pinnedPaths.reduce((paths, candidate) => {
    const normalizedPath = normalizeDocumentPath(pathFromRecentEntry(candidate));
    if (!normalizedPath || seen.has(normalizedPath) || !filePathByNormalizedPath.has(normalizedPath)) {
      return paths;
    }

    seen.add(normalizedPath);
    paths.push(filePathByNormalizedPath.get(normalizedPath));
    return paths;
  }, []);
}

export function partitionRecentFiles(
  recentFiles = [],
  pinnedPaths = [],
  ordinaryLimit = DEFAULT_RECENT_LIMIT,
) {
  const uniqueFiles = uniqueRecentFiles(recentFiles);
  const normalizedPinnedPaths = normalizePinnedRecentPaths(uniqueFiles, pinnedPaths);
  const fileByPath = new Map(uniqueFiles.map(file => [normalizeDocumentPath(pathFromRecentEntry(file)), file]));
  const pinnedPathSet = new Set(normalizedPinnedPaths.map(normalizeDocumentPath));
  const pinnedFiles = normalizedPinnedPaths.map(filePath => fileByPath.get(normalizeDocumentPath(filePath)));
  const ordinaryFiles = uniqueFiles
    .filter(file => !pinnedPathSet.has(normalizeDocumentPath(pathFromRecentEntry(file))))
    .slice(0, normalizeRecentLimit(ordinaryLimit));
  const files = [...pinnedFiles, ...ordinaryFiles];

  return {
    files,
    pinnedFiles,
    ordinaryFiles,
    pinnedPaths: normalizedPinnedPaths,
  };
}

export function upsertRecentFile(
  recentFiles = [],
  pinnedPaths = [],
  file,
  ordinaryLimit = DEFAULT_RECENT_LIMIT,
) {
  const current = partitionRecentFiles(recentFiles, pinnedPaths, ordinaryLimit);
  const filePath = pathFromRecentEntry(file);
  if (!normalizeDocumentPath(filePath)) return current;

  const existingIndex = current.files.findIndex(entry => sameDocumentPath(pathFromRecentEntry(entry), filePath));
  if (existingIndex >= 0) {
    const updatedFiles = [...current.files];
    updatedFiles[existingIndex] = file;
    return partitionRecentFiles(updatedFiles, current.pinnedPaths, ordinaryLimit);
  }

  return partitionRecentFiles(
    [...current.pinnedFiles, file, ...current.ordinaryFiles],
    current.pinnedPaths,
    ordinaryLimit,
  );
}

export function pinRecentFile(
  recentFiles = [],
  pinnedPaths = [],
  filePath,
  ordinaryLimit = DEFAULT_RECENT_LIMIT,
) {
  const current = partitionRecentFiles(recentFiles, pinnedPaths, ordinaryLimit);
  const matchingFile = current.files.find(file => sameDocumentPath(pathFromRecentEntry(file), filePath));
  if (!matchingFile) return current;

  if (current.pinnedPaths.some(path => sameDocumentPath(path, filePath))) return current;

  return partitionRecentFiles(
    current.files,
    [pathFromRecentEntry(matchingFile), ...current.pinnedPaths],
    ordinaryLimit,
  );
}

export function unpinRecentFile(
  recentFiles = [],
  pinnedPaths = [],
  filePath,
  ordinaryLimit = DEFAULT_RECENT_LIMIT,
) {
  const current = partitionRecentFiles(recentFiles, pinnedPaths, ordinaryLimit);
  const pinnedIndex = current.pinnedPaths.findIndex(path => sameDocumentPath(path, filePath));
  if (pinnedIndex < 0) return current;

  const unpinnedFile = current.pinnedFiles[pinnedIndex];
  const remainingPinnedPaths = current.pinnedPaths.filter(path => !sameDocumentPath(path, filePath));
  const remainingPinnedFiles = current.pinnedFiles.filter(file => !sameDocumentPath(pathFromRecentEntry(file), filePath));

  return partitionRecentFiles(
    [...remainingPinnedFiles, unpinnedFile, ...current.ordinaryFiles],
    remainingPinnedPaths,
    ordinaryLimit,
  );
}

export function reorderPinnedRecentFiles(
  recentFiles = [],
  pinnedPaths = [],
  requestedPaths = [],
  ordinaryLimit = DEFAULT_RECENT_LIMIT,
) {
  const current = partitionRecentFiles(recentFiles, pinnedPaths, ordinaryLimit);
  const currentPathByNormalizedPath = new Map(
    current.pinnedPaths.map(path => [normalizeDocumentPath(path), path]),
  );
  const seen = new Set();
  const reorderedPaths = [];

  requestedPaths.forEach(candidate => {
    const normalizedPath = normalizeDocumentPath(pathFromRecentEntry(candidate));
    if (!normalizedPath || seen.has(normalizedPath) || !currentPathByNormalizedPath.has(normalizedPath)) return;
    seen.add(normalizedPath);
    reorderedPaths.push(currentPathByNormalizedPath.get(normalizedPath));
  });

  current.pinnedPaths.forEach(path => {
    const normalizedPath = normalizeDocumentPath(path);
    if (seen.has(normalizedPath)) return;
    seen.add(normalizedPath);
    reorderedPaths.push(path);
  });

  return partitionRecentFiles(current.files, reorderedPaths, ordinaryLimit);
}

export function directoryFromDocumentPath(filePath) {
  const value = String(filePath || '').trim();
  const separatorIndex = Math.max(value.lastIndexOf('\\'), value.lastIndexOf('/'));
  return separatorIndex > 0 ? value.slice(0, separatorIndex) : '.';
}

export function filesFromPreferencePaths(paths = [], statuses = []) {
  const statusByPath = new Map(statuses.map(status => [normalizeDocumentPath(status.path), status.exists !== false]));
  return paths.map(filePath => ({
    path: filePath,
    name: String(filePath).split(/[\\/]/).pop(),
    directory: directoryFromDocumentPath(filePath),
    exists: statusByPath.get(normalizeDocumentPath(filePath)) !== false,
  }));
}
