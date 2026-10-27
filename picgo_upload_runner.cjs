// Only used with Quillite's validated, pinned PicGo component. Keep the official
// upload command and await its entire action, including hooks, before exiting.
const path = require('path');
const [entry, ...args] = process.argv.slice(1);
process.argv = [process.execPath, entry, ...args];
const phase = name => process.stderr.write(`\nQUILLITE_CLI_PHASE ${name}\n`);
const flush = stream => new Promise(resolve => stream.write('', resolve));
(async () => {
  try {
    const {PicGo} = require(path.resolve(path.dirname(entry), '../cli/node_modules/picgo'));
    const config = args[0] === '--config' ? args[1] : '';
    const picgo = new PicGo(config);
    picgo.registerCommands();
    phase('uploading');
    await picgo.cmd.program.parseAsync(process.argv);
    phase('finalizing');
  } catch (_) {
    // Never expose raw exceptions, which can include credentials and paths.
    process.stderr.write('[PicGo ERROR]: upload command failed\n');
    process.exitCode = 1;
  }
  await Promise.all([flush(process.stdout), flush(process.stderr)]);
  // Finished commands may leave HTTP keep-alive sockets or plugin timers open.
  // Do not wait for those unrelated handles, or bypass an unfinished action.
  process.exit(process.exitCode || 0);
})();
