export type Role = 'ADMIN' | 'USER';

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  isActive?: boolean;
  createdAt?: string;
}

export interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  country: string;
  flag: string;
  isActive: boolean;
}

export interface Source {
  id: string;
  name: string;
  website: string;
  type: 'EXCHANGE_OFFICE' | 'NEWS_AGENCY' | 'CENTRAL_BANK' | 'OTHER';
}

export interface ExchangeRate {
  id: string;
  currencyCode: string;
  rate: string;
  type: 'BUY' | 'SELL';
  sourceId: string;
  source?: Source;
  currency?: Currency;
  createdAt: string;
}

export interface HistoricalRate {
  id: string;
  currencyCode: string;
  buyRate: string;
  sellRate: string;
  sourceId: string;
  recordedAt: string;
}

export interface News {
  id: string;
  title: string;
  content: string;
  category: string;
  countryCode: string;
  currencyCode: string;
  importance: 'LOW' | 'MEDIUM' | 'HIGH';
  sourceId: string;
  publishedAt: string;
}

export interface EconomicEvent {
  id: string;
  title: string;
  country: string;
  currencyCode: string;
  forecast: string;
  previous: string;
  actual?: string;
  importance: 'LOW' | 'MEDIUM' | 'HIGH';
  eventDate: string;
}

export interface ExchangeOffice {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  verified: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ForecastPrediction {
  id: string;
  runId: string;
  pair: string;
  horizonHours: number;
  pointForecast: string;
  confidenceLow: string;
  confidenceHigh: string;
  confidenceLabel: string;
  currentRate?: string;
  predictionFor: string;
  isPublished: boolean;
  createdAt: string;
}

export interface WhatsAppIntegration {
  id: string;
  userId: string;
  name: string;
  businessAccountId: string;
  phoneNumberId: string;
  encryptedAccessToken: string;
  verifyToken: string;
  status: 'DISCONNECTED' | 'CONNECTED' | 'FAILED' | 'WAITING';
  lastSync?: string;
  sources?: WhatsAppSource[];
}

export interface WhatsAppSource {
  id: string;
  integrationId: string;
  name: string;
  description?: string;
  type: 'EXCHANGE_RATES' | 'NEWS' | 'GOLD_PRICES' | 'ECONOMIC_EVENTS';
  inviteCode?: string;
  channelJid?: string;
  active: boolean;
  syncEnabled: boolean;
  priority: number;
  lastSyncAt?: string;
  lastError?: string;
}
