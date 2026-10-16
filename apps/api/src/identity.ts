import {CanActivate,ExecutionContext,UnauthorizedException} from '@nestjs/common';
import type {Request} from 'express';
import {createRemoteJWKSet,jwtVerify,type JWTVerifyGetKey} from 'jose';
import {createHash} from 'node:crypto';
import {browserOrigins} from '@tripsaathi/domain';
export interface IdentityConfig{mode:'demo'|'oidc'|'clerk';issuer?:string;audience?:string;jwksUrl?:string;authorizedParties?:string[]}
export interface PrincipalRequest extends Request{principal?:{ownerId:string;mode:'demo'|'oidc'|'clerk'}}
export function identityConfig(env:Record<string,string|undefined>):IdentityConfig{
  const mode=env.AUTH_MODE??'demo';if(!['demo','oidc','clerk'].includes(mode))throw new Error('AUTH_MODE must be demo, oidc or clerk');
  if(mode==='demo'){if(env.APP_MODE!=='demo')throw new Error('Demo identity requires explicit APP_MODE=demo');return{mode};}
  if(mode==='clerk'){const key=env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;if(!key||!/^pk_(test|live)_/.test(key))throw new Error('Clerk mode needs the publishable key');const host=Buffer.from(key.replace(/^pk_(test|live)_/,''),'base64').toString('utf8').replace(/\$$/,'');if(!/^[a-z0-9]+([a-z0-9.-]*[a-z0-9])?$/.test(host)||!host.includes('.'))throw new Error('Clerk publishable key hostname is invalid');const issuer='https://'+host;return{mode:'clerk',issuer,jwksUrl:issuer+'/.well-known/jwks.json',authorizedParties:browserOrigins(env)};}
  const issuer=env.OIDC_ISSUER;const audience=env.OIDC_AUDIENCE;const jwksUrl=env.OIDC_JWKS_URL;
  if(!issuer||!audience||!jwksUrl)throw new Error('OIDC mode requires issuer, audience and JWKS URL');
  if(new URL(issuer).protocol!=='https:'||new URL(jwksUrl).protocol!=='https:')throw new Error('OIDC issuer and JWKS must use HTTPS');
  return{mode:'oidc',issuer,audience,jwksUrl};
}
export async function verifyIdentity(token:string,config:IdentityConfig,key:JWTVerifyGetKey):Promise<string>{
  const {payload}=await jwtVerify(token,key,{issuer:config.issuer,audience:config.audience,algorithms:['RS256','ES256'],requiredClaims:config.mode==='clerk'?['exp','iat','sub','azp']:['exp','iat','sub'],clockTolerance:30});
  if(config.mode==='clerk'&&!config.authorizedParties?.includes(String(payload.azp)))throw new Error('Token is for another application origin');
  if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>512)throw new Error('Invalid subject');
  return'oidc:'+createHash('sha256').update(JSON.stringify([config.issuer,payload.sub])).digest('hex');
}
export class IdentityGuard implements CanActivate{
  private readonly key?:JWTVerifyGetKey;
  constructor(private readonly settings:IdentityConfig){if(settings.mode!=='demo')this.key=createRemoteJWKSet(new URL(settings.jwksUrl!),{timeoutDuration:5000,cooldownDuration:30000});}
  async canActivate(context:ExecutionContext):Promise<boolean>{
    const req=context.switchToHttp().getRequest<PrincipalRequest>();
    if(req.path==='/v1/health')return true;
    if(/^\/v1\/callbacks\/tinyfish\/[a-zA-Z0-9_-]+\/[a-f0-9]{64}$/.test(req.path))return true; // Per-task token verified by callback controller.
    const origin=req.headers.origin;if(!['GET','HEAD','OPTIONS'].includes(req.method)&&origin&&!browserOrigins(process.env).includes(origin))throw new UnauthorizedException('Unexpected browser origin');
    if(this.settings.mode==='demo'){req.principal={ownerId:'local-demo',mode:'demo'};return true;}
    const header=req.headers.authorization;if(!header?.startsWith('Bearer '))throw new UnauthorizedException('A valid bearer token is required');
    try{req.principal={ownerId:await verifyIdentity(header.slice(7),this.settings,this.key!),mode:this.settings.mode};return true;}catch{throw new UnauthorizedException('Token validation failed');}
  }
}
export function owner(req:PrincipalRequest):string{if(!req.principal)throw new UnauthorizedException();return req.principal.ownerId;}
