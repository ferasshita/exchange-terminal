import { ForecastRunStatus } from '@prisma/client';

import { env } from '../config/env';
import { prisma } from '../lib/prisma';

interface ForecastResponseRow {
  pair: string;
  horizonHours: number;
  pointForecast: number;
  confidenceLow: number;
  confidenceHigh: number;
  confidenceLabel: string;
  currentRate: number;
  predictionFor: string;
}

const postForecastService = async <T>(path: string, body: unknown) => {
  const response = await fetch(new URL(path, env.FORECAST_SERVICE_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Forecast service error ${response.status}: ${errorText}`);
  }

  return response.json() as Promise<T>;
};

const fetchTrainingData = async () => {
  const [rates, news] = await Promise.all([
    prisma.exchangeRate.findMany({
      select: { currencyCode: true, rate: true, type: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.news.findMany({
      select: { content: true, publishedAt: true, title: true, countryCode: true },
      orderBy: { publishedAt: 'asc' },
    }),
  ]);

  return {
    rates: rates.map((item) => ({
      currencyCode: item.currencyCode,
      rate: Number(item.rate),
      type: item.type,
      timestamp: item.createdAt.toISOString(),
    })),
    news: news.map((item) => ({
      timestamp: item.publishedAt.toISOString(),
      text: item.content || item.title,
      countryCode: item.countryCode,
    })),
  };
};

export const runForecastTraining = async (sourceTypes: string[] = ['DATABASE', 'CSV', 'TXT', 'WHATSAPP_REALTIME']) => {
  const run = await prisma.forecastRun.create({
    data: {
      status: ForecastRunStatus.RUNNING,
      startedAt: new Date(),
      sourceTypes,
    },
  });

  try {
    const dataset = await fetchTrainingData();
    const serviceResponse = await postForecastService<{ modelVersion: string; predictions: ForecastResponseRow[] }>('/train', dataset);

    await prisma.forecastPrediction.updateMany({ data: { isPublished: false } });

    for (const prediction of serviceResponse.predictions) {
      await prisma.forecastPrediction.create({
        data: {
          runId: run.id,
          pair: prediction.pair,
          horizonHours: prediction.horizonHours,
          pointForecast: prediction.pointForecast,
          confidenceLow: prediction.confidenceLow,
          confidenceHigh: prediction.confidenceHigh,
          confidenceLabel: prediction.confidenceLabel,
          currentRate: prediction.currentRate,
          predictionFor: new Date(prediction.predictionFor),
          isPublished: true,
        },
      });
    }

    await prisma.forecastRun.update({
      where: { id: run.id },
      data: {
        status: ForecastRunStatus.SUCCESS,
        modelVersion: serviceResponse.modelVersion,
        completedAt: new Date(),
      },
    });

    return run.id;
  } catch (error) {
    await prisma.forecastRun.update({
      where: { id: run.id },
      data: {
        status: ForecastRunStatus.FAILED,
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : 'Training failed',
      },
    });
    throw error;
  }
};

export const listForecastRuns = () =>
  prisma.forecastRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { predictions: { orderBy: { createdAt: 'desc' }, take: 8 } },
  });

export const latestPublishedPredictions = () =>
  prisma.forecastPrediction.findMany({
    where: { isPublished: true },
    orderBy: [{ predictionFor: 'asc' }, { pair: 'asc' }],
  });
