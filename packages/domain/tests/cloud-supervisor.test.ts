import {describe,it,expect} from 'vitest';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const {startCloud}=createRequire(import.meta.url)('../../../scripts/start-cloud.cjs');
function fixture() {
 const children:any[]=[],exits:number[]=[];
 const spawnProcess=(_executable:string,args:string[],options:unknown)=>{
  const child:any=new EventEmitter();child.args=args;child.options=options;child.signals=[];
  child.kill=(signal:string)=>{child.signals.push(signal);return true;};children.push(child);return child;
 };
 const service=startCloud({spawnProcess,root:process.cwd(),onExit:(code:number)=>exits.push(code),log:()=>{}});
 return {children,exits,service};
}
describe('Free-demo process lifecycle',()=>{
 it('finishes migrations before launching separate API and worker processes',()=>{
  const f=fixture();expect(f.children).toHaveLength(1);expect(f.children[0].args).toContain('deploy');
  f.children[0].emit('close',0,null);expect(f.children).toHaveLength(3);
  expect(f.children[1].options.cwd).toMatch(/[\\/]apps[\\/]api$/);
  expect(f.children[2].options.cwd).toMatch(/[\\/]apps[\\/]worker$/);
  f.service.stop();f.children[1].emit('close',0);f.children[2].emit('close',0);expect(f.exits).toEqual([0]);
 });
 it('never starts the app against failed migrations',()=>{
  const f=fixture();f.children[0].emit('close',1,null);expect(f.children).toHaveLength(1);expect(f.exits).toEqual([1]);
 });
 it('terminates the API if its worker dies, including an unexpected clean exit',()=>{
  const f=fixture();f.children[0].emit('close',0,null);f.children[2].emit('close',0,null);
  expect(f.children[1].signals).toEqual(['SIGTERM']);f.children[1].emit('close',0);expect(f.exits).toEqual([1]);
 });
 it('stops migration on shutdown and does not launch apps afterward',()=>{
  const f=fixture();f.service.stop();expect(f.children[0].signals).toEqual(['SIGTERM']);
  f.children[0].emit('close',0);expect(f.children).toHaveLength(1);expect(f.exits).toEqual([0]);
 });
 it('shuts down the other child after a process start error',()=>{
  const f=fixture();f.children[0].emit('close',0,null);f.children[2].emit('error',new Error('synthetic'));
  expect(f.children[1].signals).toEqual(['SIGTERM']);f.children[2].emit('close',null);f.children[1].emit('close',0);
  expect(f.exits).toEqual([1]);
 });
 it('handles a synchronous spawn failure without starting another process',()=>{
  const exits:number[]=[];startCloud({spawnProcess:()=>{throw Error('synthetic');},onExit:(code:number)=>exits.push(code),log:()=>{}});
  expect(exits).toEqual([1]);
 });
});
