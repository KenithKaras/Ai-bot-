import { URL } from 'url';

export class SSRFError extends Error {
  public statusCode: number;
  public code: string;

  constructor(message: string, code = 'SSRF_BLOCKED', statusCode = 400) {
    super(message);
    this.name = 'SSRFError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Validates and normalizes an AI Gateway Base URL against SSRF and network misuse
 */
export const validateBaseUrl = (rawUrl: string): string => {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new SSRFError('Base URL is required.', 'INVALID_URL');
  }

  const trimmed = rawUrl.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new SSRFError('Invalid URL format. Please provide a valid HTTP or HTTPS endpoint.', 'INVALID_URL');
  }

  const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  const allowLocal = isDev || process.env.ALLOW_LOCAL_GATEWAYS === 'true';

  // 1. Enforce allowed protocols
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new SSRFError(`Protocol "${parsed.protocol}" is not supported. Use HTTPS or HTTP.`, 'UNSUPPORTED_PROTOCOL');
  }

  // Enforce HTTPS in production unless explicitly overridden
  if (!isDev && parsed.protocol === 'http:' && !allowLocal) {
    throw new SSRFError('HTTPS is required for remote AI provider endpoints in production.', 'HTTPS_REQUIRED');
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Block Cloud Metadata IP & hostnames
  const blockedMetadata = [
    '169.254.169.254',
    'metadata.google.internal',
    'metadata.internal',
    '100.100.100.200', // Alibaba Cloud metadata
    'instance-data',
  ];

  if (blockedMetadata.includes(hostname)) {
    throw new SSRFError('Access to cloud instance metadata services is forbidden.', 'METADATA_ENDPOINT_BLOCKED');
  }

  // 3. Block loopback & local addresses (unless in local development mode)
  const isLoopback =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.startsWith('127.');

  if (isLoopback && !allowLocal) {
    throw new SSRFError('Access to localhost or loopback interfaces is not permitted in remote deployment.', 'LOOPBACK_BLOCKED');
  }

  // 4. Block private IPv4 ranges (RFC 1918) in production
  if (!allowLocal) {
    // 10.0.0.0/8
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      throw new SSRFError('Access to private RFC1918 network addresses is blocked.', 'PRIVATE_IP_BLOCKED');
    }
    // 172.16.0.0/12
    if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      throw new SSRFError('Access to private RFC1918 network addresses is blocked.', 'PRIVATE_IP_BLOCKED');
    }
    // 192.168.0.0/16
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      throw new SSRFError('Access to private RFC1918 network addresses is blocked.', 'PRIVATE_IP_BLOCKED');
    }
    // 169.254.0.0/16 (Link Local)
    if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      throw new SSRFError('Access to link-local addresses is blocked.', 'LINK_LOCAL_BLOCKED');
    }
  }

  // Normalize by removing trailing slashes
  return parsed.toString().replace(/\/+$/, '');
};
