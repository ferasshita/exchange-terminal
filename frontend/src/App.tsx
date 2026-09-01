import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import {
  AdminCurrenciesPage,
  AdminEconomicEventsPage,
  AdminExchangeOfficesPage,
  AdminExchangeRatesPage,
  AdminNewsPage,
  AdminSourcesPage,
  AdminUsersPage,
  AnalyticsPage,
  ChartsPage,
  DashboardPage,
  EconomicCalendarPage,
  ExchangeOfficesPage,
  ExchangeRatesPage,
  MarketsPage,
  NewsPage,
  SettingsPage,
} from './pages/DashboardPages';
import { ForgotPasswordPage, LoginPage, RegisterPage } from './pages/AuthPages';
import { IngestionPage, PublicDashboardPage } from './pages/ForecastingPages';

const App = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/public-dashboard" element={<PublicDashboardPage />} />

    <Route element={<ProtectedRoute />}>
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/markets" element={<MarketsPage />} />
        <Route path="/exchange-rates" element={<ExchangeRatesPage />} />
        <Route path="/charts" element={<ChartsPage />} />
        <Route path="/news" element={<NewsPage />} />
        <Route path="/economic-calendar" element={<EconomicCalendarPage />} />
        <Route path="/exchange-offices" element={<ExchangeOfficesPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/ingestion" element={<IngestionPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Route>

    <Route element={<ProtectedRoute adminOnly />}>
      <Route element={<AppShell />}>
        <Route path="/admin/currencies" element={<AdminCurrenciesPage />} />
        <Route path="/admin/exchange-rates" element={<AdminExchangeRatesPage />} />
        <Route path="/admin/news" element={<AdminNewsPage />} />
        <Route path="/admin/economic-events" element={<AdminEconomicEventsPage />} />
        <Route path="/admin/sources" element={<AdminSourcesPage />} />
        <Route path="/admin/exchange-offices" element={<AdminExchangeOfficesPage />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
      </Route>
    </Route>

    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>
);

export default App;
