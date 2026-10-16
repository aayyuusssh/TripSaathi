import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {browserOrigins,serverDeployment,redisQueueConnection} from '../src/deployment';
import {identityConfig,verifyIdentity} from '../../../apps/api/src/identity';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
const {webApiOrigin}=createRequire(import.meta.url)('../../../scripts/web-api-origin.cjs');
const hosted={APP_MODE:'hosted',AUTH_MODE:'clerk',WEB_ORIGIN:'https://trip.example',DATABASE_URL:'postgresql://user:password@db.internal/trip',REDIS_URL:'redis://redis.internal:6379',IMPORT_ENCRYPTION_KEY:Buffer.alloc(32,1).toString('base64'),NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:'pk_test_'+Buffer.from('synthetic.clerk.accounts.dev$').toString('base64')};
describe('Hosted deployment boundaries',()=>{
 it('keeps local demo on loopback and honors managed hosting port',()=>{
  expect(serverDeployment({APP_MODE:'demo'})).toMatchObject({host:'127.0.0.1',port:4000});
  expect(serverDeployment({...hosted,PORT:'10000',API_PORT:'4000'})).toMatchObject({host:'0.0.0.0',port:10000});
  expect(browserOrigins(hosted)).toEqual(['https://trip.example']);
 });
 it('rejects shared demo identity, incomplete secrets and local hosted infrastructure',()=>{
  for(const invalid of [{AUTH_MODE:'demo'},{WEB_ORIGIN:''},{WEB_ORIGIN:'https://trip.example/path'},{WEB_ORIGIN:'https://trip.example/'},{WEB_ORIGIN:'http://trip.example'},{WEB_ORIGIN:'https://localhost'},{DATABASE_URL:'postgresql://localhost/trip'},{REDIS_URL:'redis://127.0.0.1'},{IMPORT_ENCRYPTION_KEY:''},{IMPORT_ENCRYPTION_KEY:'short'},{PORT:'invalid'}])expect(()=>serverDeployment({...hosted,...invalid})).toThrow();
 });
 it('preserves Redis authentication, TLS and database without disabling certificate checks',()=>{
  expect(redisQueueConnection('rediss://default:p%40ss@redis.example:6380/2')).toEqual({host:'redis.example',port:6380,db:2,username:'default',password:'p@ss',tls:{},maxRetriesPerRequest:null});
  expect(redisQueueConnection('redis://redis.internal:6379')).not.toHaveProperty('tls');
  expect(()=>redisQueueConnection('https://redis.example')).toThrow();
  expect(()=>redisQueueConnection('redis://redis.example/not-a-db')).toThrow();
 });
 it('never silently rewrites a Vercel deployment to localhost or accepts credential URLs',()=>{
  expect(webApiOrigin({})).toBe('http://127.0.0.1:4000');
  expect(webApiOrigin({VERCEL:'1',AUTH_MODE:'clerk',API_BASE_URL:'https://api.example'})).toBe('https://api.example');
  for(const invalid of [{},{API_BASE_URL:'http://127.0.0.1:4000'},{API_BASE_URL:'https://api.example/path'},{API_BASE_URL:'https://user:password@api.example'},{API_BASE_URL:'https://api.example',AUTH_MODE:'demo'}])expect(()=>webApiOrigin({VERCEL:'1',AUTH_MODE:'clerk',...invalid})).toThrow();
 });
 it('accepts a signed token for the configured frontend and rejects another origin or local origin',async()=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256'),jwk=await exportJWK(publicKey);jwk.kid='hosted-test';
  const settings=identityConfig(hosted),key=createLocalJWKSet({keys:[jwk]});
  const sign=(azp:string)=>new SignJWT({azp}).setProtectedHeader({alg:'RS256',kid:jwk.kid}).setIssuer(settings.issuer!).setSubject('test-user').setIssuedAt().setExpirationTime('1h').sign(privateKey);
  expect(await verifyIdentity(await sign('https://trip.example'),settings,key)).toMatch(/^oidc:/);
  for(const origin of ['https://other.example','http://localhost:3000'])await expect(verifyIdentity(await sign(origin),settings,key)).rejects.toThrow();
 });
});
