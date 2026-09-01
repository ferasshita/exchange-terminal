import { Router } from 'express';
import { z } from 'zod';

import { getPagination } from '../utils/pagination';
import { prisma } from '../lib/prisma';
import { importNewsFromText, importRatesFromCsv, importRatesFromText } from '../services/ingestion';
import { latestPublishedPredictions, listForecastRuns, runForecastTraining } from '../services/forecasting';

const router = Router();

const importSchema = z.object({
  fileName: z.string().min(1),
  format: z.enum(['csv', 'txt']),
  kind: z.enum(['rates', 'news']),
  content: z.string().min(1),
});

router.post('/import', async (req, res, next) => {
  try {
    const payload = importSchema.parse(req.body);

    if (payload.format === 'csv') {
      if (payload.kind !== 'rates') {
        return res.status(400).json({ message: 'CSV import currently supports rates only' });
      }
      const result = await importRatesFromCsv(payload.fileName, payload.content);
      return res.status(201).json(result);
    }

    if (payload.kind === 'rates') {
      const result = await importRatesFromText(payload.fileName, payload.content);
      return res.status(201).json(result);
    }

    const result = await importNewsFromText(payload.fileName, payload.content);
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
});

router.post('/train', async (req, res, next) => {
  try {
    const sourceTypes = z.array(z.string()).optional().parse(req.body?.sourceTypes);
    const runId = await runForecastTraining(sourceTypes);
    return res.status(202).json({ runId, status: 'queued' });
  } catch (error) {
    return next(error);
  }
});

router.get('/runs', async (_req, res, next) => {
  try {
    const runs = await listForecastRuns();
    return res.json(runs);
  } catch (error) {
    return next(error);
  }
});

router.get('/predictions/latest', async (_req, res, next) => {
  try {
    const predictions = await latestPublishedPredictions();
    return res.json(predictions);
  } catch (error) {
    return next(error);
  }
});

router.get('/imports', async (_req, res, next) => {
  try {
    const items = await prisma.importedFile.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
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
      prisma.historicalRate.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { recordedAt: 'desc' },
      }),
      prisma.historicalRate.count({ where }),
    ]);

    return res.json({ items, total, page, pageSize });
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

    const items = await prisma.historicalRate.findMany({
      where,
      orderBy: { recordedAt: 'asc' },
      take: 500,
    });

    return res.json({ items });
  } catch (error) {
    return next(error);
  }
});

export default router;
