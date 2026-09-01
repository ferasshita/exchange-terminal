import { api } from './client';
import type {
  Currency,
  EconomicEvent,
  ExchangeOffice,
  ExchangeRate,
  HistoricalRate,
  News,
  PaginatedResponse,
  Source,
  User,
  ForecastPrediction,
  WhatsAppIntegration,
  WhatsAppSource,
} from '../types/models';

export interface LoginPayload {
  email: string;
  password: string;
  rememberMe: boolean;
}

export const authService = {
  register: (payload: { fullName: string; email: string; password: string }) => api.post('/auth/register', payload),
  login: (payload: LoginPayload) => api.post<{ token: string; user: User }>('/auth/login', payload),
  profile: () => api.get<User>('/auth/profile'),
};

const asParams = (params: Record<string, unknown>) => ({ params });

export const dataService = {
  currencies: {
    list: (params: Record<string, unknown> = {}) => api.get<PaginatedResponse<Currency>>('/currencies', asParams(params)),
    create: (payload: Partial<Currency>) => api.post('/currencies', payload),
    update: (id: string, payload: Partial<Currency>) => api.put(`/currencies/${id}`, payload),
    remove: (id: string) => api.delete(`/currencies/${id}`),
  },
  sources: {
    list: (params: Record<string, unknown> = {}) => api.get<PaginatedResponse<Source>>('/sources', asParams(params)),
    create: (payload: Partial<Source>) => api.post('/sources', payload),
    update: (id: string, payload: Partial<Source>) => api.put(`/sources/${id}`, payload),
    remove: (id: string) => api.delete(`/sources/${id}`),
  },
  exchangeRates: {
    list: (params: Record<string, unknown> = {}) => api.get<PaginatedResponse<ExchangeRate>>('/exchange-rates', asParams(params)),
    create: (payload: Partial<ExchangeRate>) => api.post('/exchange-rates', payload),
    update: (id: string, payload: Partial<ExchangeRate>) => api.put(`/exchange-rates/${id}`, payload),
    remove: (id: string) => api.delete(`/exchange-rates/${id}`),
  },
  historicalRates: {
    list: (params: Record<string, unknown> = {}) => api.get<PaginatedResponse<HistoricalRate>>('/historical-rates', asParams(params)),
  },
  news: {
    list: (params: Record<string, unknown> = {}) => api.get<PaginatedResponse<News>>('/news', asParams(params)),
    create: (payload: Partial<News>) => api.post('/news', payload),
    update: (id: string, payload: Partial<News>) => api.put(`/news/${id}`, payload),
    remove: (id: string) => api.delete(`/news/${id}`),
  },
  economicEvents: {
    list: (params: Record<string, unknown> = {}) =>
      api.get<PaginatedResponse<EconomicEvent>>('/economic-events', asParams(params)),
    create: (payload: Partial<EconomicEvent>) => api.post('/economic-events', payload),
    update: (id: string, payload: Partial<EconomicEvent>) => api.put(`/economic-events/${id}`, payload),
    remove: (id: string) => api.delete(`/economic-events/${id}`),
  },
  exchangeOffices: {
    list: (params: Record<string, unknown> = {}) =>
      api.get<PaginatedResponse<ExchangeOffice>>('/exchange-offices', asParams(params)),
    create: (payload: Partial<ExchangeOffice>) => api.post('/exchange-offices', payload),
    update: (id: string, payload: Partial<ExchangeOffice>) => api.put(`/exchange-offices/${id}`, payload),
    remove: (id: string) => api.delete(`/exchange-offices/${id}`),
  },
  users: {
    list: (params: Record<string, unknown> = {}) => api.get<PaginatedResponse<User>>('/users', asParams(params)),
    setRole: (id: string, role: User['role']) => api.patch(`/users/${id}/role`, { role }),
    setStatus: (id: string, isActive: boolean) => api.patch(`/users/${id}/status`, { isActive }),
  },
  search: (q: string) => api.get('/search', { params: { q } }),
  forecasting: {
    importFile: (payload: { fileName: string; format: 'csv' | 'txt'; kind: 'rates' | 'news'; content: string }) =>
      api.post('/forecasting/import', payload),
    train: (payload?: { sourceTypes?: string[] }) => api.post('/forecasting/train', payload ?? {}),
    runs: () => api.get('/forecasting/runs'),
    latest: () => api.get<ForecastPrediction[]>('/forecasting/predictions/latest'),
    historicalTable: (params: Record<string, unknown> = {}) =>
      api.get<PaginatedResponse<HistoricalRate>>('/forecasting/historical-table', asParams(params)),
    historicalSeries: (params: Record<string, unknown> = {}) =>
      api.get<{ items: HistoricalRate[] }>('/forecasting/historical-series', asParams(params)),
  },
  whatsapp: {
    listIntegrations: () => api.get<{ items: WhatsAppIntegration[] }>('/whatsapp/integrations'),
    createIntegration: (payload: Partial<WhatsAppIntegration>) => api.post('/whatsapp/integrations', payload),
    connectIntegration: (id: string) => api.post(`/whatsapp/integrations/${id}/connect`),
    addSource: (id: string, payload: Partial<WhatsAppSource>) => api.post(`/whatsapp/integrations/${id}/sources`, payload),
  },
  publicDashboard: {
    predictions: () => api.get<{ items: ForecastPrediction[] }>('/public/predictions'),
    historicalSeries: (params: Record<string, unknown> = {}) =>
      api.get<{ items: HistoricalRate[] }>('/public/historical-series', asParams(params)),
    historicalTable: (params: Record<string, unknown> = {}) =>
      api.get<PaginatedResponse<HistoricalRate>>('/public/historical-table', asParams(params)),
  },
};
