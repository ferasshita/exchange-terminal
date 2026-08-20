import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { refreshForecastSnapshots } from '../services/forecasting';
import { importMarketData } from '../services/market-ingestion';
import { getPagination } from '../utils/pagination';

const router = Router();

const importSchema = z.object({
  fileName: z.string().min(3),
  content: z.string().min(1),
  datasetType: z.enum(['AUTO', 'RATES', 'NEWS']).default('AUTO'),
  sourceName: z.string().min(2).optional(),
  retrainAfterImport: z.boolean().default(true),
});

router.get('/', async (req, res, next) => {
  try {
    const { skip, page, pageSize } = getPagination(req.query as Record<string, unknown>);
    const [items, total] = await Promise.all([
      prisma.dataImport.findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.dataImport.count(),
    ]);

    return res.json({ items, total, page, pageSize });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const payload = importSchema.parse(req.body);
    const result = await importMarketData(payload);
    const forecasts = payload.retrainAfterImport ? await refreshForecastSnapshots() : [];
    return res.status(201).json({
      ...result,
      forecastsGenerated: forecasts.length,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
