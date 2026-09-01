import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.string().default('4000'),
  JWT_SECRET: z.string().min(8),
  JWT_EXPIRES_IN: z.string().default('1d'),
  JWT_REMEMBER_EXPIRES_IN: z.string().default('30d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  FORECAST_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  FORECAST_REFRESH_MINUTES: z.string().default('60'),
});

export const env = envSchema.parse(process.env);
