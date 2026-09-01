import { ImportSourceType, ImportStatus, Importance, RateType, SourceType, WhatsAppMessageType, WhatsAppParseStatus } from '@prisma/client';

import { prisma } from '../lib/prisma';

interface ParsedWhatsAppMessage {
  timestamp: Date;
  sender: string;
  text: string;
}

const HEADER_RE = /^\[(\d{1,2}:\d{2}\s?[AP]M),\s*(\d{1,2}\/\d{1,2}\/\d{4})\]\s*([^:]+):\s?(.*)$/;
const DIRECTION_MAP: Record<string, number> = { '🔺': 1, '🔻': -1, '➖': 0 };
const CURRENCY_PATTERNS: Record<string, RegExp> = {
  'USD/LYD': /دولار[^=\n]*=\s*([\d.]+)\s*دينار\s*(🔺|🔻|➖)?\s*(⚡)?/,
  'EUR/LYD': /يورو[^=\n]*=\s*([\d.]+)\s*دينار\s*(🔺|🔻|➖)?\s*(⚡)?/,
  'GBP/LYD': /باوند[^=\n]*=\s*([\d.]+)\s*دينار\s*(🔺|🔻|➖)?\s*(⚡)?/,
  'SUKUK/LYD': /صكوك[^=\n]*=\s*([\d.]+)\s*دينار\s*(🔺|🔻|➖)?\s*(⚡)?/,
};

const normalizeArabic = (text: string) => text.replace(/[\u064B-\u065F\u0670\u0640]/g, '');

const ensureDefaultSource = async () => {
  const existing = await prisma.source.findFirst({ where: { name: 'Platform Ingestion' } });
  if (existing) return existing;

  return prisma.source.create({
    data: {
      name: 'Platform Ingestion',
      website: 'https://local.ingestion',
      type: SourceType.OTHER,
    },
  });
};

const parseDateTime = (dateStr: string, timeStr: string) => {
  const parsed = new Date(`${dateStr} ${timeStr}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const parseWhatsAppExport = (content: string): ParsedWhatsAppMessage[] => {
  const messages: ParsedWhatsAppMessage[] = [];
  let current: ParsedWhatsAppMessage | null = null;

  for (const line of content.split(/\r?\n/)) {
    const match = HEADER_RE.exec(line.trim());
    if (match) {
      if (current) messages.push(current);
      const [, time, date, sender, first] = match;
      const timestamp = parseDateTime(date, time);
      if (!timestamp) {
        current = null;
        continue;
      }
      current = { timestamp, sender: sender.trim(), text: first ?? '' };
    } else if (current && line.trim()) {
      current.text = `${current.text}\n${line}`;
    }
  }

  if (current) messages.push(current);
  return messages;
};

const parseRatesFromMessages = (messages: ParsedWhatsAppMessage[]) => {
  const rows: Array<{ timestamp: Date; pair: string; sellRate: number; direction: number; sharpMove: boolean; sender: string }> = [];

  for (const message of messages) {
    const body = normalizeArabic(message.text);
    for (const [pair, pattern] of Object.entries(CURRENCY_PATTERNS)) {
      const match = pattern.exec(body);
      if (!match) continue;
      rows.push({
        timestamp: message.timestamp,
        pair,
        sellRate: Number(match[1]),
        direction: DIRECTION_MAP[match[2] ?? ''] ?? 0,
        sharpMove: Boolean(match[3]),
        sender: message.sender,
      });
    }
  }

  return rows;
};

const parseRatesFromText = (text: string) =>
  parseRatesFromMessages([{ timestamp: new Date(), sender: 'realtime', text }]).map((x) => ({
    pair: x.pair,
    sellRate: x.sellRate,
  }));

const parseCsvRows = (content: string) => {
  const lines = content.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (lines.length <= 1) return [] as Array<Record<string, string>>;

  const headers = lines[0].split(',').map((x) => x.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((x) => x.trim());
    return headers.reduce<Record<string, string>>((acc, key, index) => {
      acc[key] = values[index] ?? '';
      return acc;
    }, {});
  });
};

const normalizePairToCode = (pair: string) => pair.split('/')[0]?.toUpperCase() ?? pair.toUpperCase();

const upsertCurrency = async (code: string) => {
  const existing = await prisma.currency.findUnique({ where: { code } });
  if (existing) return existing;

  return prisma.currency.create({
    data: {
      code,
      name: code,
      symbol: code,
      country: 'Unknown',
      flag: '🏳️',
    },
  });
};

const insertRateAndHistory = async (row: { currencyCode: string; rate: number; createdAt: Date }, sourceId: string) => {
  const created = await prisma.exchangeRate.create({
    data: {
      currencyCode: row.currencyCode,
      rate: row.rate,
      sourceId,
      type: RateType.SELL,
      createdAt: row.createdAt,
    },
  });

  await prisma.historicalRate.create({
    data: {
      currencyCode: row.currencyCode,
      sourceId,
      sellRate: row.rate,
      buyRate: row.rate,
      recordedAt: row.createdAt,
    },
  });

  return created;
};

export const importRatesFromText = async (fileName: string, content: string) => {
  const file = await prisma.importedFile.create({
    data: { fileName, sourceType: ImportSourceType.TXT, contentType: 'text/plain', status: ImportStatus.PENDING },
  });

  try {
    const source = await ensureDefaultSource();
    const messages = parseWhatsAppExport(content);
    const rates = parseRatesFromMessages(messages);

    let imported = 0;
    for (const row of rates) {
      await upsertCurrency(normalizePairToCode(row.pair));
      await insertRateAndHistory(
        { currencyCode: normalizePairToCode(row.pair), rate: row.sellRate, createdAt: row.timestamp },
        source.id,
      );
      imported += 1;
    }

    await prisma.importedFile.update({
      where: { id: file.id },
      data: { status: ImportStatus.PROCESSED, recordsIn: messages.length, recordsOut: imported },
    });

    return { importId: file.id, recordsIn: messages.length, recordsOut: imported };
  } catch (error) {
    await prisma.importedFile.update({
      where: { id: file.id },
      data: { status: ImportStatus.FAILED, error: error instanceof Error ? error.message : 'Import failed' },
    });
    throw error;
  }
};

export const importNewsFromText = async (fileName: string, content: string) => {
  const file = await prisma.importedFile.create({
    data: { fileName, sourceType: ImportSourceType.TXT, contentType: 'text/plain', status: ImportStatus.PENDING },
  });

  try {
    const source = await ensureDefaultSource();
    const messages = parseWhatsAppExport(content);
    await upsertCurrency('USD');

    for (const message of messages) {
      await prisma.news.create({
        data: {
          title: message.text.slice(0, 120) || 'WhatsApp news',
          content: message.text,
          category: 'WhatsApp',
          countryCode: 'LY',
          currencyCode: 'USD',
          importance: Importance.MEDIUM,
          sourceId: source.id,
          publishedAt: message.timestamp,
        },
      });
    }

    await prisma.importedFile.update({
      where: { id: file.id },
      data: { status: ImportStatus.PROCESSED, recordsIn: messages.length, recordsOut: messages.length },
    });

    return { importId: file.id, recordsIn: messages.length, recordsOut: messages.length };
  } catch (error) {
    await prisma.importedFile.update({
      where: { id: file.id },
      data: { status: ImportStatus.FAILED, error: error instanceof Error ? error.message : 'Import failed' },
    });
    throw error;
  }
};

export const importRatesFromCsv = async (fileName: string, content: string) => {
  const file = await prisma.importedFile.create({
    data: { fileName, sourceType: ImportSourceType.CSV, contentType: 'text/csv', status: ImportStatus.PENDING },
  });

  try {
    const rows = parseCsvRows(content);
    const source = await ensureDefaultSource();

    let imported = 0;
    for (const row of rows) {
      const pair = row.pair || row.currency || 'USD/LYD';
      const rate = Number(row.sell_rate || row.rate || row.sell);
      const timestamp = new Date(row.timestamp || row.createdat || row.date || new Date().toISOString());
      if (!Number.isFinite(rate) || Number.isNaN(timestamp.getTime())) continue;

      const code = normalizePairToCode(pair);
      await upsertCurrency(code);
      await insertRateAndHistory({ currencyCode: code, rate, createdAt: timestamp }, source.id);
      imported += 1;
    }

    await prisma.importedFile.update({
      where: { id: file.id },
      data: { status: ImportStatus.PROCESSED, recordsIn: rows.length, recordsOut: imported },
    });

    return { importId: file.id, recordsIn: rows.length, recordsOut: imported };
  } catch (error) {
    await prisma.importedFile.update({
      where: { id: file.id },
      data: { status: ImportStatus.FAILED, error: error instanceof Error ? error.message : 'Import failed' },
    });
    throw error;
  }
};

const inferMessageType = (payload: unknown): WhatsAppMessageType => {
  if (!payload || typeof payload !== 'object') return WhatsAppMessageType.UNKNOWN;
  const obj = payload as Record<string, unknown>;
  if (typeof obj.text === 'string') return WhatsAppMessageType.TEXT;
  return WhatsAppMessageType.UNKNOWN;
};

export const ingestRealtimeWhatsAppMessage = async (input: {
  integrationId: string;
  sourceId?: string;
  messageId: string;
  sender: string;
  text: string;
  receivedAt: Date;
  payload: unknown;
}) => {
  const message = await prisma.whatsAppMessage.upsert({
    where: { integrationId_messageId: { integrationId: input.integrationId, messageId: input.messageId } },
    update: {
      messageText: input.text,
      receivedAt: input.receivedAt,
      rawPayload: input.payload as object,
    },
    create: {
      integrationId: input.integrationId,
      sourceId: input.sourceId,
      sender: input.sender,
      messageId: input.messageId,
      messageText: input.text,
      receivedAt: input.receivedAt,
      messageType: inferMessageType(input.payload),
      rawPayload: input.payload as object,
      parseStatus: WhatsAppParseStatus.PARSED,
    },
  });

  await prisma.processingLog.create({
    data: {
      messageId: message.id,
      action: 'INGEST',
      status: 'OK',
    },
  });

  const source = await ensureDefaultSource();
  const rates = parseRatesFromText(input.text);
  if (rates.length) {
    for (const rate of rates) {
      const currencyCode = normalizePairToCode(rate.pair);
      await upsertCurrency(currencyCode);
      await insertRateAndHistory({ currencyCode, rate: rate.sellRate, createdAt: input.receivedAt }, source.id);
    }
  } else {
    await upsertCurrency('USD');
    await prisma.news.create({
      data: {
        title: input.text.slice(0, 120) || 'WhatsApp realtime',
        content: input.text,
        category: 'WhatsApp Realtime',
        countryCode: 'LY',
        currencyCode: 'USD',
        importance: Importance.MEDIUM,
        sourceId: source.id,
        publishedAt: input.receivedAt,
      },
    });
  }

  return message;
};
