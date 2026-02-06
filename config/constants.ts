/**
 * Application-wide configuration constants
 */

export const APP_CONFIG = {
  name: 'Flow Builder',
  description: 'Build flows with ease',
  version: '1.0.0',
} as const;

export const ROUTES = {
  HOME: '/',
  SIGN_IN: '/auth/signin',
  SIGN_UP: '/auth/signup',
  DASHBOARD: '/dashboard',
} as const;

export const AUTH_CONFIG = {
  MIN_PASSWORD_LENGTH: 6,
  SESSION_STORAGE_KEY: 'supabase.auth.token',
} as const;

export const UI_CONFIG = {
  TOAST_DURATION: 3000,
  REDIRECT_DELAY: 2000,
} as const;
