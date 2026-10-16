import type { NextConfig } from 'next';
import {config as loadEnvironment} from 'dotenv';
import {resolve} from 'node:path';
loadEnvironment({path:resolve(__dirname,'../../.env')});
const authMode=process.env.AUTH_MODE??'demo';
const {webApiOrigin}=require(resolve(__dirname,'../../scripts/web-api-origin.cjs'));
const apiOrigin:string=webApiOrigin(process.env);
if(authMode!=='demo'&&(!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY||!process.env.CLERK_SECRET_KEY))throw new Error('Managed frontend login requires Clerk publishable and secret keys');
const config: NextConfig = {
  // Preserve 127.0.0.1 in Clerk's same-origin rewrite. NextURL otherwise turns
  // it into localhost, which Next treats as an external proxy destination.
  skipProxyUrlNormalize: true,
  env:{NEXT_PUBLIC_AUTH_MODE:authMode,NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY??''},
  transpilePackages: ['@tripsaathi/domain'],
  // Temporal's CommonJS build needs JSBI's CommonJS export, including during SSR.
  webpack(config) { config.resolve.alias['jsbi$'] = require.resolve('jsbi/dist/jsbi-cjs.js'); return config; },
  async rewrites() { return [{ source: '/api/:path*', destination: `${apiOrigin}/:path*` }]; }
};
export default config;
