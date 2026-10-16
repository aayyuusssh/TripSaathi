type Environment = Record<string, string | undefined>;
const localOrigins = ['http://127.0.0.1:3000', 'http://localhost:3000'];
const loopback = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);

export function browserOrigins(env: Environment): string[] {
  const hosted = env.APP_MODE === 'hosted';
  if (hosted && !env.WEB_ORIGIN) throw new Error('Hosted mode requires WEB_ORIGIN');
  const origins = env.WEB_ORIGIN ? [env.WEB_ORIGIN] : [];
  for (const origin of origins) {
    const url = new URL(origin);
    if (url.origin !== origin || url.username || url.password ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback(url.hostname) && !hosted)) ||
      (hosted && loopback(url.hostname))) throw new Error('WEB_ORIGIN must be an exact HTTPS frontend origin in hosted mode');
  }
  return hosted ? origins : [...new Set([...localOrigins, ...origins])];
}

export function serverDeployment(env: Environment) {
  if (!['demo', 'hosted'].includes(env.APP_MODE ?? '')) throw new Error('APP_MODE must be demo or hosted');
  const hosted = env.APP_MODE === 'hosted';
  const origins = browserOrigins(env);
  if (hosted) {
    if (env.AUTH_MODE !== 'clerk') throw new Error('Hosted mode requires AUTH_MODE=clerk');
    for (const [name, protocols] of [['DATABASE_URL', ['postgres:', 'postgresql:']], ['REDIS_URL', ['redis:', 'rediss:']]] as const) {
      if (!env[name]) throw new Error(`Hosted mode requires ${name}`);
      const url = new URL(env[name]!);
      if (!(protocols as readonly string[]).includes(url.protocol) || loopback(url.hostname)) throw new Error(`Hosted ${name} must reference a hosted service`);
    }
    if (!/^[A-Za-z0-9+/]{43}=$/.test(env.IMPORT_ENCRYPTION_KEY ?? '')) throw new Error('Hosted mode requires one shared base64 32-byte IMPORT_ENCRYPTION_KEY');
  }
  const port = Number(env.PORT || env.API_PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid API port');
  return {hosted, origins, host: hosted ? '0.0.0.0' : '127.0.0.1', port};
}

export function redisQueueConnection(value: string) {
  const url = new URL(value);
  if (!['redis:', 'rediss:'].includes(url.protocol)) throw new Error('REDIS_URL must use redis or rediss');
  const database = url.pathname.replace(/^\//, '');
  if (database && !/^\d+$/.test(database)) throw new Error('Invalid Redis database');
  const db = Number(database || 0), port = Number(url.port || 6379);
  if (!Number.isSafeInteger(db) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid Redis address');
  return {host: url.hostname, port, db, username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    ...(url.protocol === 'rediss:' ? {tls: {}} : {}), maxRetriesPerRequest: null};
}
