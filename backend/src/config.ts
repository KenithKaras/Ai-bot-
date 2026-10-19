import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Look for .env in current directory and backend directory
const envPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend/.env'),
  path.resolve(process.cwd(), '../.env'),
];

for (const p of envPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
  }
}
dotenv.config();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  radoxApiKey: string;
  radoxBaseUrl: string;
  allowedOrigins: string[];
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  requestTimeoutMs: number;
}

const parseOrigins = (rawOrigins?: string): string[] => {
  if (!rawOrigins) {
    return ['http://localhost:5173', 'http://127.0.0.1:5173'];
  }
  return rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
};

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  radoxApiKey: (process.env.RADOX_API_KEY || '').trim(),
  radoxBaseUrl: (process.env.RADOX_BASE_URL || 'https://radoxai.com/v1').trim().replace(/\/+$/, ''),
  allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '60', 10),
  requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '60000', 10),
};

export const isApiKeyConfigured = (): boolean => {
  return config.radoxApiKey.length > 0 && config.radoxApiKey !== 'your_radox_api_key_here';
};
