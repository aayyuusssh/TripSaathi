let tokenGetter:(()=>Promise<string|null>)|undefined;
export function setApiTokenGetter(getter:typeof tokenGetter){tokenGetter=getter;}
export async function authenticatedFetch(path:string,init:RequestInit={}){
  if(!path.startsWith('/api/v1/'))throw new Error('Authenticated requests must target this application API');
  const headers=new Headers(init.headers);const token=await tokenGetter?.();if(token)headers.set('Authorization',`Bearer ${token}`);
  if(process.env.NEXT_PUBLIC_AUTH_MODE&&process.env.NEXT_PUBLIC_AUTH_MODE!=='demo'&&!token)throw new Error('Session token unavailable; refresh your signed-in session');
  return fetch(path,{...init,headers,credentials:'same-origin',cache:'no-store'});
}
export async function downloadOriginal(id:string,fileName:string){const response=await authenticatedFetch(`/api/v1/imports/${encodeURIComponent(id)}/original`);if(!response.ok)throw new Error('Original could not be downloaded');const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download=fileName;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function api<T>(path:string,data?:unknown,method?:'POST'|'PATCH'):Promise<T>{
  const response=await authenticatedFetch(`/api/v1/${path}`,{method:data===undefined?'GET':method??'POST',headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
  const body=await response.json().catch(()=>({message:'Server unavailable'}));
  if(!response.ok)throw new Error(Array.isArray(body.message)?body.message.join(', '):body.message||`HTTP ${response.status}`);
  return body as T;
}
