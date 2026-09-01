import { Router } from 'express';

import { prisma } from '../lib/prisma';
import { getPagination } from '../utils/pagination';

const router = Router();

router.get('/predictions', async (_req, res, next) => {
  try {
    const predictions = await prisma.forecastPrediction.findMany({
      where: { isPublished: true },
      orderBy: [{ predictionFor: 'asc' }, { pair: 'asc' }],
    });

    return res.json({ items: predictions });
  } catch (error) {
    return next(error);
  }
});

router.get('/historical-series', async (req, res, next) => {
  try {
    const currencyCode = (req.query.currencyCode as string | undefined)?.toUpperCase();
    const fromDate = req.query.fromDate ? new Date(String(req.query.fromDate)) : undefined;
    const toDate = req.query.toDate ? new Date(String(req.query.toDate)) : undefined;

    const where = {
      ...(currencyCode ? { currencyCode } : {}),
      ...(fromDate || toDate
        ? {
            recordedAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    };

    const items = await prisma.historicalRate.findMany({ where, orderBy: { recordedAt: 'asc' }, take: 500 });
    return res.json({ items });
  } catch (error) {
    return next(error);
  }
});

router.get('/historical-table', async (req, res, next) => {
  try {
    const { skip, page, pageSize } = getPagination(req.query as Record<string, unknown>);
    const currencyCode = (req.query.currencyCode as string | undefined)?.toUpperCase();
    const where = currencyCode ? { currencyCode } : {};

    const [items, total] = await Promise.all([
      prisma.historicalRate.findMany({ where, skip, take: pageSize, orderBy: { recordedAt: 'desc' } }),
      prisma.historicalRate.count({ where }),
    ]);

    return res.json({ items, total, page, pageSize });
  } catch (error) {
    return next(error);
  }
});

export default router;
