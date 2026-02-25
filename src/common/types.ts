export interface User {
  id: string;
  email: string;
  tier: string;
  isAdmin: boolean;
}

export interface LoginResponse {
  success: boolean;
  user: User;
  tokens: Tokens;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResponse {
  success: boolean;
  tokens: Tokens;
}

export interface ScanSummary {
  id: string;
  normalizedDomain: string;
  trustScore: number | null;
  riskLevel: 'green' | 'yellow' | 'red' | null;
  verdict: string | null;
  websiteType: string | null;
  faviconUrl: string | null;
  cachedUntil: string | null;
  completedAt: string | null;
  stale: boolean;
}

export interface RunningScan {
  scanId: string;
  status: 'queued' | 'running';
  createdAt: string;
}

export interface LookupResponse {
  success: boolean;
  scan: ScanSummary | null;
  runningScan: RunningScan | null;
}

export interface RescanEligibility {
  eligible: boolean;
  nextAvailableAt: string | null;
}

export interface ScanTriggerResponse {
  success: boolean;
  scanId: string;
}

export interface StreamTokenResponse {
  success: boolean;
  token: string;
}

export type RiskLevel = 'green' | 'yellow' | 'red';

export type IconDisplayMode = 'numbers' | 'symbols';

export type TrustBarPosition = 'top' | 'bottom';

export interface ExtensionSettings {
  iconDisplayMode: IconDisplayMode;
  trustBarEnabled: boolean;
  trustBarPosition: TrustBarPosition;
  trustBarSize: number;
}

export interface TrustBarData {
  enabled: boolean;
  riskLevel: RiskLevel;
  position: TrustBarPosition;
  size: number;
}

export type ContentMessage = { type: 'UPDATE_BAR'; data: TrustBarData | null };

export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface CacheEntry {
  data: LookupResponse;
  timestamp: number;
}

// Messages between popup and background
export type BackgroundMessage =
  | { type: 'GET_LOOKUP'; domain: string }
  | { type: 'TRIGGER_SCAN'; domain: string }
  | { type: 'LOGIN'; email: string; password: string }
  | { type: 'LOGOUT' }
  | { type: 'GET_AUTH' }
  | { type: 'CHECK_RESCAN'; scanId: string }
  | { type: 'TRIGGER_RESCAN'; domain: string }
  | { type: 'GET_STREAM_TOKEN'; scanId: string }
  | { type: 'INVALIDATE_CACHE'; domain: string }
  | { type: 'GET_WEB_LOGIN_URL'; redirect: string }
  | { type: 'GET_SETTINGS' }
  | { type: 'SET_SETTINGS'; settings: ExtensionSettings }
  | { type: 'GET_BAR_DATA'; domain: string }
  | { type: 'BAR_SETTINGS_CHANGED' };
