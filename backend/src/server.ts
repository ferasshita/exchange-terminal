import { env } from './config/env';
import app from './app';
import { runForecastTraining } from './services/forecasting';

app.listen(Number(env.PORT), () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${env.PORT}`);
});

const refreshMinutes = Math.max(5, Number(env.FORECAST_REFRESH_MINUTES));
setInterval(() => {
  runForecastTraining().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Scheduled forecast refresh failed:', error);
  });
}, refreshMinutes * 60 * 1000);
