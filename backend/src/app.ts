import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env';
import { auth, authorize } from './middleware/auth';
import { errorHandler } from './middleware/error';
import authRoutes from './routes/auth';
import currenciesRoutes from './routes/currencies';
import economicEventsRoutes from './routes/economic-events';
import exchangeOfficesRoutes from './routes/exchange-offices';
import exchangeRatesRoutes from './routes/exchange-rates';
import historicalRatesRoutes from './routes/historical-rates';
import newsRoutes from './routes/news';
import forecastingRoutes from './routes/forecasting';
import publicDashboardRoutes from './routes/public-dashboard';
import searchRoutes from './routes/search';
import sourcesRoutes from './routes/sources';
import usersRoutes from './routes/users';
import whatsappRoutes from './routes/whatsapp';

const app = express();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const protectedLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authLimiter, authRoutes);
app.use('/public', protectedLimiter, publicDashboardRoutes);

const adminWriteGuard = [auth, (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.method === 'GET') {
    return next();
  }

  return authorize('ADMIN')(req, res, next);
}];

app.use('/currencies', protectedLimiter, ...adminWriteGuard, currenciesRoutes);
app.use('/sources', protectedLimiter, ...adminWriteGuard, sourcesRoutes);
app.use('/exchange-rates', protectedLimiter, ...adminWriteGuard, exchangeRatesRoutes);
app.use('/historical-rates', protectedLimiter, auth, historicalRatesRoutes);
app.use('/news', protectedLimiter, ...adminWriteGuard, newsRoutes);
app.use('/economic-events', protectedLimiter, ...adminWriteGuard, economicEventsRoutes);
app.use('/exchange-offices', protectedLimiter, ...adminWriteGuard, exchangeOfficesRoutes);
app.use('/search', protectedLimiter, auth, searchRoutes);
app.use('/users', protectedLimiter, auth, authorize('ADMIN'), usersRoutes);
app.use('/whatsapp', protectedLimiter, auth, whatsappRoutes);
app.use('/forecasting', protectedLimiter, auth, forecastingRoutes);

app.use(errorHandler);

export default app;
