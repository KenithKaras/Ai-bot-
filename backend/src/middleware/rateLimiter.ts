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
