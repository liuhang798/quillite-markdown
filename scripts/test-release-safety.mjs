// Read-only regression gate. Tests create their own isolated temporary fixtures.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const go = process.env.GO_EXECUTABLE || 'go';
for (const [command, args] of [
  [go, ['test', './...', '-count=1', '-run', 'Test.*(Uninstall|Installer|Draft|Conflict|Receipt|Atomic|Replacement|Commit|Workspace|Diagnostic|Recovery)']],
  [process.execPath, ['--test', 'frontend/tests/document-conflict.test.mjs', 'frontend/tests/document-recovery.test.mjs', 'frontend/tests/document-session.test.mjs', 'frontend/tests/document-tools.test.mjs']],
]) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Source-level release safety gate passed. Installer lifecycle requires disposable Windows CI.');
