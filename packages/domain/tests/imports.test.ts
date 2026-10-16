import {describe,it,expect} from 'vitest';
import {sniffDocument,MAX_DOCUMENT_BYTES,extractionSchema,notificationAllowed} from '../src/imports';
import {encryptDocument,decryptDocument} from '../../database/src/private-documents';
describe('private document boundaries',()=>{
 it('rejects mismatched and oversized documents',()=>{expect(()=>sniffDocument(Buffer.from('%PDF-1.4'),'text/plain')).toThrow();expect(()=>sniffDocument(new Uint8Array(MAX_DOCUMENT_BYTES+1),'text/plain')).toThrow();expect(sniffDocument(Buffer.from('booking'),'text/plain')).toBe('text/plain');});
 it('rejects invalid UTF8 and binary content',()=>{expect(()=>sniffDocument(new Uint8Array([255,0]),'text/plain')).toThrow();expect(()=>sniffDocument(new Uint8Array([65,0]),'text/plain')).toThrow();});
 it('rejects excessive image dimensions',()=>{const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.writeUInt32BE(10001,16);bytes.writeUInt32BE(1,20);expect(()=>sniffDocument(bytes,'image/png')).toThrow();});
 it('authenticates the owner, record and ciphertext',()=>{const key=Buffer.alloc(32,17),source=Buffer.from('synthetic booking');const encrypted=encryptDocument(source,'owner','record',key);expect(decryptDocument(encrypted,'owner','record',key)).toEqual(source);expect(()=>decryptDocument(encrypted,'other','record',key)).toThrow();expect(()=>decryptDocument(encrypted,'owner','other',key)).toThrow();encrypted[encrypted.length-1]^=1;expect(()=>decryptDocument(encrypted,'owner','record',key)).toThrow();});
 it('cannot claim bookings when extraction was blocked',()=>{expect(extractionSchema.safeParse({outcome:'BLOCKED',title:null,destination:null,items:[{}],unknowns:[]}).success).toBe(false);});
 it('suppresses replay and muted notifications',()=>{expect(notificationAllowed('LIVE_STATUS_CHANGED','LIVE',true,false)).toBe(true);expect(notificationAllowed('LIVE_STATUS_CHANGED','REPLAY',true,false)).toBe(false);expect(notificationAllowed('STATUS_UPDATED','REPLAY',true,true)).toBe(true);expect(notificationAllowed('EXECUTION_UPDATED','LIVE',false,true)).toBe(false);});
});
