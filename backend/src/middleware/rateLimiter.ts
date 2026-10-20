import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

/**
 * Standard rate limiter to prevent abuse and denial-of-service
 */
export const standardRateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many requests from this IP. Please try again after a minute.',
      code: 'RATE_LIMIT_EXCEEDED',
      status: 429,
    },
  },
});

/**
 * Stricter rate limiter for resource-intensive completions and streaming
 */
export const chatRateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: Math.max(30, Math.floor(config.rateLimitMaxRequests * 0.75)),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Chat request rate limit reached. Please pace your messages.',
      code: 'CHAT_RATE_LIMIT_EXCEEDED',
      status: 429,
    },
  },
});

/**
 * Authentication rate limiter to mitigate brute-force and credential stuffing attacks
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 1000 : 20, // 20 attempts per 15 min per IP in prod
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many authentication attempts from this IP. Please try again later.',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      status: 429,
    },
  },
});
