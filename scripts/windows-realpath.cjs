// OneDrive on this host rejects native asynchronous realpath despite readable files.
// Retry only that EPERM case using Node's synchronous resolver. Other errors propagate.
const fs = require('node:fs');
const original = fs.promises.realpath.bind(fs.promises);
fs.promises.realpath = async (...args) => {
  try { return await original(...args); }
  catch (error) { if (process.platform === 'win32' && error.code === 'EPERM') return fs.realpathSync(...args); throw error; }
};
// This sandbox cannot create junctions on OneDrive. Only our two internal
// workspace-package links may fall back to copies; external links still fail.
const path = require('node:path');
const nativeRealpath = fs.realpathSync.native.bind(fs.realpathSync);
fs.realpathSync.native = (...args) => {
  try { return nativeRealpath(...args); }
  catch (error) { if (process.platform === 'win32' && error.code === 'EPERM') return fs.realpathSync(...args); throw error; }
};
const project = path.resolve(__dirname, '..');
// On this host OneDrive sometimes rejects async .next directory creation while
// the same synchronous operation succeeds. Limit the retry to generated output.
const asyncMkdir = fs.promises.mkdir.bind(fs.promises);
fs.promises.mkdir = async (...args) => {
  try { return await asyncMkdir(...args); }
  catch (error) {
    const target = path.resolve(String(args[0]));
    const generated = path.join(project, 'apps', 'web', '.next') + path.sep;
    if (process.platform !== 'win32' || error.code !== 'EPERM' || !target.startsWith(generated)) throw error;
    return fs.mkdirSync(...args);
  }
};
const callbackMkdir = fs.mkdir.bind(fs);
fs.mkdir = (target, options, callback) => {
  if (typeof options === 'function') { callback = options; options = undefined; }
  const done = (error, created) => {
    const resolved = path.resolve(String(target));
    const generated = path.join(project, 'apps', 'web', '.next') + path.sep;
    if (error && process.platform === 'win32' && error.code === 'EPERM' && resolved.startsWith(generated)) {
      try { created = fs.mkdirSync(target, options); error = null; } catch (retryError) { error = retryError; }
    }
    callback(error, created);
  };
  return callbackMkdir(target, options, done);
};
const originalSymlink = fs.promises.symlink.bind(fs.promises);
fs.promises.symlink = async (target, destination, type) => {
  try { return await originalSymlink(target, destination, type); }
  catch (error) {
    const source = path.resolve(path.dirname(destination), target);
    const permitted = ['domain', 'database'].some(name => source === path.join(project, 'packages', name));
    const within = path.resolve(destination).startsWith(project + path.sep) && path.resolve(destination).includes(path.sep + 'node_modules' + path.sep);
    if (process.platform !== 'win32' || error.code !== 'EPERM' || !permitted || !within) throw error;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true });
    console.warn('[TripSaathi] Workspace package copied because Windows junction creation was denied:', path.basename(source));
  }
};
