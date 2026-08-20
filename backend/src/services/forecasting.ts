import { prisma } from '../lib/prisma';
import { analyzeNewsText } from './market-ingestion';

const MODEL_VERSION = 'notebook-ts-v1';
const HORIZONS = [24, 48] as const;

interface HourPoint {
  timestamp: Date;
  sellRate: number;
  sentimentMean: number;
  newsCount: number;
  relevanceMean: number;
}

interface ForecastSnapshotRecord {
  currencyCode: string;
  horizonHours: number;
  currentRate: number;
  predictedRate: number;
  lowerBound: number;
  upperBound: number;
  confidenceLabel: string;
  featureCount: number;
  dataPoints: number;
  metadata: Record<string, unknown>;
}

type FeatureRow = Record<string, number>;

const toHourKey = (value: Date) => {
  const copy = new Date(value);
  copy.setUTCMinutes(0, 0, 0);
  return copy.toISOString();
};

const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

const std = (values: number[]) => {
  if (values.length < 2) {
    return 0;
  }

  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
};

const quantile = (values: number[], q: number) => {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q)));
  return sorted[index];
};

const buildHourlySeries = async (currencyCode: string): Promise<HourPoint[]> => {
  const [history, news] = await Promise.all([
    prisma.historicalRate.findMany({
      where: { currencyCode },
      orderBy: { recordedAt: 'asc' },
    }),
    prisma.news.findMany({
      where: { currencyCode },
      orderBy: { publishedAt: 'asc' },
    }),
  ]);

  if (!history.length) {
    return [];
  }

  const rateByHour = new Map<string, number>();
  for (const row of history) {
    rateByHour.set(toHourKey(row.recordedAt), Number(row.sellRate));
  }

  const newsByHour = new Map<string, { sentiments: number[]; relevances: number[] }>();
  for (const row of news) {
    const key = toHourKey(row.publishedAt);
    const bucket = newsByHour.get(key) ?? { sentiments: [], relevances: [] };
    const analysis = analyzeNewsText(`${row.title}\n${row.content}`);
    bucket.sentiments.push(analysis.sentiment * analysis.relevance);
    bucket.relevances.push(analysis.relevance);
    newsByHour.set(key, bucket);
  }

  const sortedKeys = Array.from(rateByHour.keys()).sort();
  const start = new Date(sortedKeys[0]);
  const end = new Date(sortedKeys[sortedKeys.length - 1]);
  const result: HourPoint[] = [];
  let cursor = new Date(start);
  let lastRate = rateByHour.get(sortedKeys[0]) ?? 0;

  while (cursor <= end) {
    const key = cursor.toISOString();
    if (rateByHour.has(key)) {
      lastRate = rateByHour.get(key) ?? lastRate;
    }

    const newsBucket = newsByHour.get(key);
    result.push({
      timestamp: new Date(cursor),
      sellRate: lastRate,
      sentimentMean: newsBucket ? mean(newsBucket.sentiments) : 0,
      newsCount: newsBucket ? newsBucket.sentiments.length : 0,
      relevanceMean: newsBucket ? mean(newsBucket.relevances) : 0,
    });

    cursor = new Date(cursor.getTime() + 60 * 60 * 1000);
  }

  return result.filter((row) => row.sellRate > 0);
};

const rollingMean = (rows: HourPoint[], index: number, key: keyof HourPoint, span: number) => {
  if (index - span + 1 < 0) {
    return NaN;
  }
  const values = rows.slice(index - span + 1, index + 1).map((row) => Number(row[key]));
  return mean(values);
};

const rollingStd = (rows: HourPoint[], index: number, key: keyof HourPoint, span: number) => {
  if (index - span + 1 < 0) {
    return NaN;
  }
  const values = rows.slice(index - span + 1, index + 1).map((row) => Number(row[key]));
  return std(values);
};

const engineerRows = (rows: HourPoint[]) => {
  const featureRows: Array<{ timestamp: Date; sellRate: number; target24: number; target48: number; features: FeatureRow }> = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const lagValues = [1, 3, 6, 12, 24, 48].map((lag) => rows[index - lag]?.sellRate ?? NaN);
    const rateRollMean24 = rollingMean(rows, index, 'sellRate', 24);
    const rateRollStd24 = rollingStd(rows, index, 'sellRate', 24);
    const prev24 = rows[index - 24]?.sellRate ?? NaN;
    const sentRollMean24 = rollingMean(rows, index, 'sentimentMean', 24);
    const sentRollMean6 = rollingMean(rows, index, 'sentimentMean', 6);
    const newsCountRoll24 =
      index - 23 >= 0 ? rows.slice(index - 23, index + 1).reduce((sum, item) => sum + item.newsCount, 0) : NaN;
    const relevanceRollMean24 = rollingMean(rows, index, 'relevanceMean', 24);

    const featureMap: FeatureRow = {
      rate_lag_1: lagValues[0],
      rate_lag_3: lagValues[1],
      rate_lag_6: lagValues[2],
      rate_lag_12: lagValues[3],
      rate_lag_24: lagValues[4],
      rate_lag_48: lagValues[5],
      rate_roll_mean_24: rateRollMean24,
      rate_roll_std_24: rateRollStd24,
      rate_change_24: Number.isFinite(prev24) ? row.sellRate - prev24 : NaN,
      rate_change_pct_24: Number.isFinite(prev24) && prev24 !== 0 ? (row.sellRate - prev24) / prev24 : NaN,
      sent_roll_mean_24: sentRollMean24,
      sent_roll_mean_6: sentRollMean6,
      news_count_roll_24: newsCountRoll24,
      relevance_roll_mean_24: relevanceRollMean24,
      hour: row.timestamp.getUTCHours(),
      day_of_week: row.timestamp.getUTCDay(),
    };

    const values = Object.values(featureMap);
    const target24 = rows[index + 24]?.sellRate ?? NaN;
    const target48 = rows[index + 48]?.sellRate ?? NaN;
    if (values.every(Number.isFinite) && Number.isFinite(target24) && Number.isFinite(target48)) {
      featureRows.push({
        timestamp: row.timestamp,
        sellRate: row.sellRate,
        target24,
        target48,
        features: featureMap,
      });
    }
  }

  return featureRows;
};

const solveLinearSystem = (matrix: number[][], vector: number[]) => {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) {
        pivot = row;
      }
    }

    if (Math.abs(augmented[pivot][column]) < 1e-9) {
      continue;
    }

    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const pivotValue = augmented[column][column];
    for (let offset = column; offset <= size; offset += 1) {
      augmented[column][offset] /= pivotValue;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) {
        continue;
      }
      const factor = augmented[row][column];
      for (let offset = column; offset <= size; offset += 1) {
        augmented[row][offset] -= factor * augmented[column][offset];
      }
    }
  }

  return augmented.map((row) => row[size] ?? 0);
};

const fitLinearRegression = (rows: FeatureRow[], targets: number[], featureNames: string[]) => {
  const design = rows.map((row) => [1, ...featureNames.map((name) => row[name] ?? 0)]);
  const width = design[0].length;
  const xtx = Array.from({ length: width }, () => Array.from({ length: width }, () => 0));
  const xty = Array.from({ length: width }, () => 0);

  for (let i = 0; i < design.length; i += 1) {
    const features = design[i];
    const target = targets[i];
    for (let row = 0; row < width; row += 1) {
      xty[row] += features[row] * target;
      for (let col = 0; col < width; col += 1) {
        xtx[row][col] += features[row] * features[col];
      }
    }
  }

  for (let diagonal = 0; diagonal < width; diagonal += 1) {
    xtx[diagonal][diagonal] += 1e-5;
  }

  const coefficients = solveLinearSystem(xtx, xty);
  const predict = (row: FeatureRow) =>
    coefficients[0] +
    featureNames.reduce((sum, featureName, index) => sum + (row[featureName] ?? 0) * coefficients[index + 1], 0);

  return { coefficients, predict };
};

const confidenceLabel = (currentRate: number, intervalWidth: number, recentVolatility: number) => {
  const widthPct = currentRate > 0 ? intervalWidth / currentRate : intervalWidth;
  const benchmark = recentVolatility > 0 ? recentVolatility / currentRate : widthPct;
  if (widthPct <= Math.max(0.01, benchmark * 0.8)) {
    return 'High';
  }
  if (widthPct <= Math.max(0.02, benchmark * 1.4)) {
    return 'Medium';
  }
  return 'Low';
};

const fallbackForecast = (currencyCode: string, rows: HourPoint[]): ForecastSnapshotRecord[] => {
  const latest = rows[rows.length - 1];
  const previous24 = rows[Math.max(0, rows.length - 25)]?.sellRate ?? latest.sellRate;
  const trend24 = latest.sellRate - previous24;
  const recentWindow = rows.slice(-48).map((row) => row.sellRate);
  const volatility = std(recentWindow) || latest.sellRate * 0.02;

  return HORIZONS.map((horizonHours) => {
    const multiplier = horizonHours / 24;
    const predictedRate = latest.sellRate + trend24 * multiplier;
    const width = volatility * Math.max(1.5, multiplier);
    return {
      currencyCode,
      horizonHours,
      currentRate: latest.sellRate,
      predictedRate,
      lowerBound: Math.max(0, predictedRate - width),
      upperBound: predictedRate + width,
      confidenceLabel: 'Low',
      featureCount: 0,
      dataPoints: rows.length,
      metadata: { strategy: 'fallback-trend' },
    };
  });
};

const buildForecastsForCurrency = async (currencyCode: string): Promise<ForecastSnapshotRecord[]> => {
  const rows = await buildHourlySeries(currencyCode);
  if (rows.length < 72) {
    return rows.length ? fallbackForecast(currencyCode, rows) : [];
  }

  const engineered = engineerRows(rows);
  if (engineered.length < 20) {
    return fallbackForecast(currencyCode, rows);
  }

  const featureNames = Object.keys(engineered[0].features);
  const latest = engineered[engineered.length - 1];
  const recentVolatility = std(rows.slice(-48).map((row) => row.sellRate));

  return HORIZONS.map((horizonHours) => {
    const targetKey = horizonHours === 24 ? 'target24' : 'target48';
    const trainingRows = engineered.map((row) => row.features);
    const targets = engineered.map((row) => row[targetKey]);
    const model = fitLinearRegression(trainingRows, targets, featureNames);
    const fitted = trainingRows.map((row) => model.predict(row));
    const residuals = fitted.map((prediction, index) => targets[index] - prediction);
    const residualLow = quantile(residuals, 0.1);
    const residualHigh = quantile(residuals, 0.9);
    const predictedRate = model.predict(latest.features);
    const lowerBound = Math.max(0, predictedRate + residualLow);
    const upperBound = Math.max(lowerBound, predictedRate + residualHigh);

    return {
      currencyCode,
      horizonHours,
      currentRate: latest.sellRate,
      predictedRate,
      lowerBound,
      upperBound,
      confidenceLabel: confidenceLabel(latest.sellRate, upperBound - lowerBound, recentVolatility),
      featureCount: featureNames.length,
      dataPoints: engineered.length,
      metadata: {
        strategy: 'linear-regression',
        residualStd: std(residuals),
        recentVolatility,
      },
    };
  });
};

export const refreshForecastSnapshots = async () => {
  const currencies = await prisma.currency.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
  });

  const snapshots = (await Promise.all(currencies.map((currency) => buildForecastsForCurrency(currency.code)))).flat();
  await prisma.forecastSnapshot.deleteMany();

  if (!snapshots.length) {
    return [];
  }

  const generatedAt = new Date();
  await prisma.forecastSnapshot.createMany({
    data: snapshots.map((snapshot) => ({
      currencyCode: snapshot.currencyCode,
      horizonHours: snapshot.horizonHours,
      currentRate: snapshot.currentRate,
      predictedRate: snapshot.predictedRate,
      lowerBound: snapshot.lowerBound,
      upperBound: snapshot.upperBound,
      confidenceLabel: snapshot.confidenceLabel,
      modelVersion: MODEL_VERSION,
      featureCount: snapshot.featureCount,
      dataPoints: snapshot.dataPoints,
      metadata: snapshot.metadata,
      generatedAt,
    })),
  });

  return prisma.forecastSnapshot.findMany({
    orderBy: [{ currencyCode: 'asc' }, { horizonHours: 'asc' }],
  });
};

export const getPublicMarketDashboard = async () => {
  const [forecasts, history, currentRates] = await Promise.all([
    prisma.forecastSnapshot.findMany({
      include: { currency: true },
      orderBy: [{ currencyCode: 'asc' }, { horizonHours: 'asc' }],
    }),
    prisma.historicalRate.findMany({
      include: { currency: true, source: true },
      orderBy: { recordedAt: 'desc' },
      take: 250,
    }),
    prisma.exchangeRate.findMany({
      include: { currency: true, source: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ]);

  return {
    generatedAt: forecasts[0]?.generatedAt ?? null,
    predictions: forecasts,
    historicalRates: history.reverse(),
    liveRates: currentRates,
  };
};
