import {clerkMiddleware} from '@clerk/nextjs/server';
import {NextResponse,type NextRequest,type NextFetchEvent} from 'next/server';
export default function proxy(request:NextRequest,event:NextFetchEvent){
 if((process.env.AUTH_MODE??'demo')==='demo')return NextResponse.next();
 // Explicit client session tokens are verified by the API IdentityGuard
 // (signature, issuer, expiry and application origin), including SSE/uploads.
 // Do not require a second cookie session for these same-origin API forwards.
 if(request.nextUrl.pathname.startsWith('/api/v1/')&&request.headers.get('authorization')?.startsWith('Bearer '))return NextResponse.next();
 return clerkMiddleware(async(auth,req)=>{
  if(req.nextUrl.pathname.startsWith('/api/v1/')&&!req.nextUrl.pathname.startsWith('/api/v1/callbacks/')&&req.nextUrl.pathname!=='/api/v1/health'){
   const identity=await auth();if(!identity.userId)return NextResponse.json({message:'Sign in required'},{status:401});
   const supplied=req.headers.get('authorization');const token=supplied?.startsWith('Bearer ')?supplied.slice(7):await identity.getToken(process.env.AUTH_MODE==='oidc'?{template:process.env.CLERK_JWT_TEMPLATE??'tripsaathi'}:undefined);if(!token)return NextResponse.json({message:'Session token unavailable'},{status:401});
   const headers=new Headers(req.headers);headers.set('Authorization',`Bearer ${token}`);return NextResponse.next({request:{headers}});
  }return NextResponse.next();
 },{clockSkewInMs:30_000})(request,event);
}
export const config={matcher:['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico)).*)','/(api|trpc)(.*)']};
