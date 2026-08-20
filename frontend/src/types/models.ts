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

export interface DataImport {
  id: string;
  fileName: string;
  fileType: string;
  datasetType: string;
  status: string;
  recordsImported: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ForecastSnapshot {
  id: string;
  currencyCode: string;
  horizonHours: number;
  currentRate: string;
  predictedRate: string;
  lowerBound: string;
  upperBound: string;
  confidenceLabel: string;
  modelVersion: string;
  featureCount: number;
  dataPoints: number;
  generatedAt: string;
  currency?: Currency;
  metadata?: Record<string, unknown>;
}

export interface WhatsAppSource {
  id: string;
  integrationId: string;
  name: string;
  description?: string;
  type: 'EXCHANGE_RATES' | 'NEWS' | 'GOLD_PRICES' | 'ECONOMIC_EVENTS';
  active: boolean;
  priority: number;
  createdAt: string;
}

export interface WhatsAppMessage {
  id: string;
  integrationId: string;
  sourceId?: string;
  sender: string;
  messageId: string;
  messageText: string;
  receivedAt: string;
  processed: boolean;
  parseStatus: 'PENDING' | 'PARSED' | 'FAILED' | 'REVIEW' | 'APPROVED' | 'REJECTED';
  confidence: number;
  source?: WhatsAppSource;
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
  createdAt: string;
  updatedAt: string;
  sources?: WhatsAppSource[];
  _count?: { messages: number };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
