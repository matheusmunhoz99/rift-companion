import https from 'node:https';
import type { LcuCredentials } from './credentials';

// O cliente usa um certificado autoassinado da Riot em 127.0.0.1.
// A verificação é desligada apenas para este agente, que só fala com localhost.
const localAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

export class LcuHttpError extends Error {
  constructor(
    readonly status: number,
    readonly endpoint: string,
    body: string,
  ) {
    super(`LCU ${status} em ${endpoint}: ${body.slice(0, 200)}`);
  }
}

export function authHeader(credentials: LcuCredentials): string {
  return 'Basic ' + Buffer.from(`riot:${credentials.password}`).toString('base64');
}

export function lcuRequest<T>(
  credentials: LcuCredentials,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  endpoint: string,
  body?: unknown,
): Promise<T> {
  const payload = body === undefined ? undefined : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        host: '127.0.0.1',
        port: credentials.port,
        path: endpoint,
        method,
        agent: localAgent,
        timeout: 5_000,
        headers: {
          Authorization: authHeader(credentials),
          Accept: 'application/json',
          ...(payload ? { 'Content-Type': 'application/json' } : {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const status = response.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new LcuHttpError(status, endpoint, text));
            return;
          }
          try {
            resolve((text ? JSON.parse(text) : null) as T);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on('timeout', () => request.destroy(new Error(`Timeout em ${endpoint}`)));
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}
