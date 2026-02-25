const IS_DEV = true; // Toggle for development vs production

export const CONFIG = {
  API_BASE_URL: IS_DEV ? 'http://10.0.2.2:3001' : 'https://siteray.io',
  WEB_BASE_URL: IS_DEV ? 'http://10.0.2.2:3000' : 'https://siteray.io',
  CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes
} as const;
