import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
export function projectRoot():string{let dir=process.cwd();for(let n=0;n<15;n++){if(existsSync(join(dir,'pnpm-workspace.yaml'))&&existsSync(join(dir,'package.json'))&&JSON.parse(readFileSync(join(dir,'package.json'),'utf8')).name==='tripsaathi')return dir;const parent=dirname(dir);if(parent===dir)break;dir=parent;}throw new Error('Start TripSaathi within its workspace');}
export function documentKey():Buffer{
 const configured=process.env.IMPORT_ENCRYPTION_KEY;if(configured){const key=Buffer.from(configured,'base64');if(key.length!==32)throw new Error('IMPORT_ENCRYPTION_KEY must encode 32 random bytes');return key;}
 const directory=resolve(projectRoot(),'.private','keys'),file=join(directory,'imports.key');mkdirSync(directory,{recursive:true});
 try{writeFileSync(file,randomBytes(32),{flag:'wx',mode:0o600});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
 const key=readFileSync(file);if(key.length!==32)throw new Error('Local document encryption key is invalid');return key;
}
export function encryptDocument(bytes:Uint8Array,ownerId:string,id:string,key=documentKey()):Buffer{const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.from(JSON.stringify([ownerId,id])));const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);return Buffer.concat([Buffer.from('TSI1'),nonce,cipher.getAuthTag(),encrypted]);}
export function decryptDocument(bytes:Uint8Array,ownerId:string,id:string,key=documentKey()):Buffer{const blob=Buffer.from(bytes);if(blob.length<32||blob.subarray(0,4).toString()!=='TSI1')throw new Error('Invalid encrypted document');const decipher=createDecipheriv('aes-256-gcm',key,blob.subarray(4,16));decipher.setAAD(Buffer.from(JSON.stringify([ownerId,id])));decipher.setAuthTag(blob.subarray(16,32));return Buffer.concat([decipher.update(blob.subarray(32)),decipher.final()]);}
