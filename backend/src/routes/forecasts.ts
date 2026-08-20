import { Router } from 'express';

import { prisma } from '../lib/prisma';
import { refreshForecastSnapshots } from '../services/forecasting';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const items = await prisma.forecastSnapshot.findMany({
      include: { currency: true },
      orderBy: [{ currencyCode: 'asc' }, { horizonHours: 'asc' }],
    });

    return res.json({ items });
  } catch (error) {
    return next(error);
  }
});

router.post('/retrain', async (_req, res, next) => {
  try {
    const items = await refreshForecastSnapshots();
    return res.status(201).json({
      items,
      modelVersion: items[0]?.modelVersion ?? 'notebook-ts-v1',
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
