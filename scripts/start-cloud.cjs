// Free-demo supervisor. API and worker remain separate processes but share
// one service lifecycle: when the host sleeps, BOTH stop. No keepalive pings.
const {spawn} = require('node:child_process');
const {resolve} = require('node:path');

function startCloud({spawnProcess=spawn, root=resolve(__dirname, '..'),
  onExit=code=>process.exit(code), log=message=>console.log(message), stopTimeoutMs=20000}={}) {
  const children = new Set();
  let stopping=false, finished=false, exitCode=0, shutdownTimer;
  function finish() {
    if (finished) return;
    finished=true;
    clearTimeout(shutdownTimer);
    onExit(exitCode);
  }
  function stop(code=0) {
    if (stopping || finished) return;
    stopping=true;
    exitCode=code;
    for (const child of children) child.kill('SIGTERM');
    if (!children.size) return finish();
    shutdownTimer=setTimeout(()=>{
      for (const child of children) child.kill('SIGKILL');
      finish();
    },stopTimeoutMs);
    shutdownTimer.unref?.();
  }
  function launch(label,args,cwd,completed) {
    if (stopping || finished) return;
    let child;
    try { child=spawnProcess(process.execPath,args,{cwd,env:process.env,stdio:'inherit',windowsHide:true}); }
    catch { log(`Unable to start ${label}`); stop(1); return; }
    children.add(child);
    child.once('error',()=>{ log(`Unable to run ${label}`); stop(1); });
    child.once('close',(code,signal)=>{
      children.delete(child);
      if (stopping) { if (!children.size) finish(); return; }
      if (code===0 && !signal && completed) completed();
      else { log(`${label} stopped; shutting down the combined service`); stop(1); }
    });
  }
  log('Free demo: API and worker pause together whenever the hosting service sleeps.');
  launch('database migrations',[resolve(root,'node_modules/prisma/build/index.js'),'migrate','deploy',
    '--schema',resolve(root,'packages/database/prisma/schema.prisma')],root,()=>{
    launch('API',['dist/main.js'],resolve(root,'apps/api'));
    launch('worker',['dist/main.js'],resolve(root,'apps/worker'));
  });
  return {stop};
}

if (require.main===module) {
  const service=startCloud();
  process.once('SIGINT',()=>service.stop());
  process.once('SIGTERM',()=>service.stop());
}
module.exports={startCloud};
