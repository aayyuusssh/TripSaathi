// Server-only configuration: no credentials or API keys belong in this URL.
function webApiOrigin(env) {
  if (env.VERCEL && (!env.API_BASE_URL || env.AUTH_MODE !== 'clerk')) {
    throw new Error('Vercel requires API_BASE_URL (hosted HTTPS API origin) and AUTH_MODE=clerk');
  }
  const value = env.API_BASE_URL || 'http://127.0.0.1:4000';
  const url = new URL(value);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.origin !== value || url.username || url.password ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && !env.VERCEL)) ||
    (env.VERCEL && local)) throw new Error('API_BASE_URL must be an exact HTTPS API origin, without path or credentials');
  return value;
}
module.exports = {webApiOrigin};
