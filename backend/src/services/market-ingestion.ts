import crypto from 'crypto';

import {
  Importance,
  Prisma,
  RateType,
  SourceType,
  WhatsAppIntegrationStatus,
  WhatsAppMessageType,
  WhatsAppParseStatus,
  WhatsAppSourceType,
} from '@prisma/client';

import { prisma } from '../lib/prisma';

const MSG_HEADER_RE = /^\[(\d{1,2}:\d{2}\s?[AP]M),\s*(\d{1,2}\/\d{1,2}\/\d{4})\]\s*([^:]+):\s?(.*)$/m;

const CURRENCY_DICTIONARY: Record<string, { code: string; name: string; symbol: string; country: string; flag: string }> = {
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', country: 'United States', flag: 'US' },
  EUR: { code: 'EUR', name: 'Euro', symbol: 'EUR', country: 'Eurozone', flag: 'EU' },
  GBP: { code: 'GBP', name: 'Pound Sterling', symbol: 'GBP', country: 'United Kingdom', flag: 'GB' },
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: 'JPY', country: 'Japan', flag: 'JP' },
  SUKUK: { code: 'SUKUK', name: 'Sukuk', symbol: 'SUKUK', country: 'Libya', flag: 'LY' },
};

const RATE_LABEL_MAP: Record<string, string> = {
  دولار: 'USD',
  الدولار: 'USD',
  يورو: 'EUR',
  الباوند: 'GBP',
  باوند: 'GBP',
  جنيه: 'GBP',
  صكوك: 'SUKUK',
  صُكوك: 'SUKUK',
};

const IMPORTANCE_KEYWORDS = {
  HIGH: ['عاجل', 'urgent', 'breaking'],
  MEDIUM: ['بيان', 'statement', 'update'],
};

const UP_WORDS = ['ارتفاع', 'زيادة', 'قفز', 'صعود', 'غلا', 'gain', 'rise', 'higher'];
const DOWN_WORDS = ['انخفاض', 'تراجع', 'هبوط', 'نزول', 'رخص', 'drop', 'fall', 'lower'];
const RELEVANCE_KEYWORDS = ['ليبيا', 'دينار', 'الدولار', 'اقتصاد', 'عملة', 'مصرف', 'السوق الموازي', 'exchange', 'market'];

interface ParsedChatMessage {
  timestamp: Date;
  sender: string;
  text: string;
}

interface ParsedRateRecord {
  timestamp: Date;
  currencyCode: string;
  buyRate?: number;
  sellRate: number;
  sourceName: string;
}

interface ParsedNewsRecord {
  timestamp: Date;
  title: string;
  content: string;
  category: string;
  currencyCode: string;
  countryCode: string;
  importance: Importance;
  sourceName: string;
}

interface ImportRequest {
  fileName: string;
  content: string;
  datasetType: 'AUTO' | 'RATES' | 'NEWS';
  sourceName?: string;
}

interface ImportResult {
  datasetType: 'RATES' | 'NEWS';
  recordsImported: number;
  notes: string;
}

const hashText = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export const normalizeArabic = (text: string) => text.replace(/[\u064B-\u065F\u0670\u0640]/g, '');

const normalizeForLookup = (text: string) => normalizeArabic(text).replace(/\s+/g, ' ').trim().toLowerCase();

const parseWhatsAppTimestamp = (dateText: string, timeText: string) => {
  const [month, day, year] = dateText.split('/').map(Number);
  const [timePart, meridiemRaw] = timeText.trim().split(/\s+/);
  const [hourRaw, minuteRaw] = timePart.split(':').map(Number);
  const meridiem = meridiemRaw.toUpperCase();
  let hour = hourRaw % 12;
  if (meridiem === 'PM') {
    hour += 12;
  }

  return new Date(Date.UTC(year, month - 1, day, hour, minuteRaw));
};

export const parseWhatsAppExport = (content: string) => {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const messages: ParsedChatMessage[] = [];
  let current: ParsedChatMessage | null = null;

  for (const line of lines) {
    const match = line.match(/^\[(\d{1,2}:\d{2}\s?[AP]M),\s*(\d{1,2}\/\d{1,2}\/\d{4})\]\s*([^:]+):\s?(.*)$/);
    if (match) {
      if (current) {
        current.text = current.text.trim();
        messages.push(current);
      }

      current = {
        timestamp: parseWhatsAppTimestamp(match[2], match[1]),
        sender: match[3].trim(),
        text: match[4] ?? '',
      };
      continue;
    }

    if (current) {
      current.text = [current.text, line].filter(Boolean).join('\n');
    }
  }

  if (current) {
    current.text = current.text.trim();
    messages.push(current);
  }

  return messages;
};

const inferCurrencyCode = (text: string) => {
  const normalized = normalizeForLookup(text);
  for (const [label, code] of Object.entries(RATE_LABEL_MAP)) {
    if (normalized.includes(normalizeForLookup(label))) {
      return code;
    }
  }

  if (normalized.includes('usd') || normalized.includes('dollar')) return 'USD';
  if (normalized.includes('eur') || normalized.includes('euro')) return 'EUR';
  if (normalized.includes('gbp') || normalized.includes('pound')) return 'GBP';
  if (normalized.includes('jpy') || normalized.includes('yen')) return 'JPY';
  return 'USD';
};

const inferCountryCode = (text: string) => {
  const normalized = normalizeForLookup(text);
  if (normalized.includes('libya') || normalized.includes('ليبيا')) return 'LY';
  if (normalized.includes('saudi') || normalized.includes('السعودية') || normalized.includes('المملكة')) return 'SA';
  if (normalized.includes('euro') || normalized.includes('أوروبا')) return 'EU';
  if (normalized.includes('britain') || normalized.includes('uk') || normalized.includes('المملكة المتحدة')) return 'GB';
  return 'LY';
};

const inferImportance = (text: string): Importance => {
  const normalized = normalizeForLookup(text);
  if (IMPORTANCE_KEYWORDS.HIGH.some((keyword) => normalized.includes(keyword))) {
    return Importance.HIGH;
  }

  if (IMPORTANCE_KEYWORDS.MEDIUM.some((keyword) => normalized.includes(keyword))) {
    return Importance.MEDIUM;
  }

  return Importance.LOW;
};

export const analyzeNewsText = (text: string) => {
  const normalized = normalizeForLookup(text);
  const relevance = RELEVANCE_KEYWORDS.some((keyword) => normalized.includes(normalizeForLookup(keyword))) ? 0.9 : 0.1;
  const up = UP_WORDS.filter((word) => normalized.includes(normalizeForLookup(word))).length;
  const down = DOWN_WORDS.filter((word) => normalized.includes(normalizeForLookup(word))).length;
  const sentiment = up === down ? 0 : up > down ? 1 : -1;
  return { relevance, sentiment };
};

export const parseRatesMessages = (messages: ParsedChatMessage[], defaultSourceName = 'WhatsApp Rates Import'): ParsedRateRecord[] => {
  const records: ParsedRateRecord[] = [];

  for (const message of messages) {
    if (!message.text || !/دينار|lyd|usd|eur|gbp/i.test(message.text)) {
      continue;
    }

    for (const line of message.text.split('\n')) {
      const normalized = normalizeArabic(line).trim();
      const match = normalized.match(/([^\n=]+?)\s*[=:=]\s*([0-9]+(?:\.[0-9]+)?)/);
      if (!match) {
        continue;
      }

      const currencyCode = inferCurrencyCode(match[1]);
      const sellRate = Number(match[2]);
      if (!Number.isFinite(sellRate)) {
        continue;
      }

      records.push({
        timestamp: message.timestamp,
        currencyCode,
        sellRate,
        buyRate: sellRate,
        sourceName: defaultSourceName,
      });
    }
  }

  return records;
};

export const parseNewsMessages = (messages: ParsedChatMessage[], defaultSourceName = 'WhatsApp News Import'): ParsedNewsRecord[] =>
  messages
    .map((message) => {
      const content = message.text.trim();
      if (!content) {
        return null;
      }

      const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
      const title = lines[0]?.slice(0, 160) ?? 'WhatsApp update';

      return {
        timestamp: message.timestamp,
        title,
        content,
        category: 'WhatsApp',
        currencyCode: inferCurrencyCode(content),
        countryCode: inferCountryCode(content),
        importance: inferImportance(content),
        sourceName: defaultSourceName,
      };
    })
    .filter((record): record is ParsedNewsRecord => Boolean(record));

const parseCsv = (content: string) => {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field.trim());
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((value) => value.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
};

const normalizeHeader = (value: string) => value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

const parseDateValue = (value: string) => {
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  if (MSG_HEADER_RE.test(value)) {
    const parsed = parseWhatsAppExport(value);
    return parsed[0]?.timestamp ?? new Date();
  }

  return new Date();
};

const parseRatesCsv = (content: string, defaultSourceName: string) => {
  const rows = parseCsv(content);
  if (rows.length < 2) {
    return [] as ParsedRateRecord[];
  }

  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).flatMap((row) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']));
    const currencyCode = inferCurrencyCode(record.currencycode || record.currency || record.code || '');
    const sellRate = Number(record.sellrate || record.rate || record.sell || record.close);
    const buyRate = Number(record.buyrate || record.buy || record.open || sellRate);
    if (!currencyCode || !Number.isFinite(sellRate)) {
      return [];
    }

    return [
      {
        timestamp: parseDateValue(record.timestamp || record.recordedat || record.createdat || new Date().toISOString()),
        currencyCode,
        buyRate: Number.isFinite(buyRate) ? buyRate : sellRate,
        sellRate,
        sourceName: record.sourcename || record.source || defaultSourceName,
      },
    ];
  });
};

const parseNewsCsv = (content: string, defaultSourceName: string) => {
  const rows = parseCsv(content);
  if (rows.length < 2) {
    return [] as ParsedNewsRecord[];
  }

  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).flatMap((row) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']));
    const contentText = record.content || record.message || record.body;
    const title = record.title || contentText?.slice(0, 120);
    if (!contentText || !title) {
      return [];
    }

    const importanceRaw = (record.importance || '').toUpperCase();
    const importance =
      importanceRaw === 'HIGH' ? Importance.HIGH : importanceRaw === 'MEDIUM' ? Importance.MEDIUM : importanceRaw === 'LOW' ? Importance.LOW : inferImportance(contentText);

    return [
      {
        timestamp: parseDateValue(record.timestamp || record.publishedat || record.createdat || new Date().toISOString()),
        title,
        content: contentText,
        category: record.category || 'Imported',
        currencyCode: (record.currencycode || '').toUpperCase() || inferCurrencyCode(contentText),
        countryCode: (record.countrycode || '').toUpperCase() || inferCountryCode(contentText),
        importance,
        sourceName: record.sourcename || record.source || defaultSourceName,
      },
    ];
  });
};

const ensureCurrency = async (currencyCode: string) => {
  const code = currencyCode.toUpperCase();
  const existing = await prisma.currency.findUnique({ where: { code } });
  if (existing) {
    return existing;
  }

  const seed = CURRENCY_DICTIONARY[code] ?? {
    code,
    name: code,
    symbol: code,
    country: 'Unknown',
    flag: code.slice(0, 2),
  };

  return prisma.currency.create({
    data: seed,
  });
};

const ensureSource = async (name: string, type: SourceType) => {
  const existing = await prisma.source.findFirst({ where: { name } });
  if (existing) {
    return existing;
  }

  return prisma.source.create({
    data: {
      name,
      website: 'https://example.local/imported',
      type,
    },
  });
};

const importRateRecords = async (records: ParsedRateRecord[]) => {
  let imported = 0;

  for (const record of records) {
    await ensureCurrency(record.currencyCode);
    const source = await ensureSource(record.sourceName, SourceType.OTHER);
    const buyRate = record.buyRate ?? record.sellRate;

    await prisma.exchangeRate.createMany({
      data: [
        {
          currencyCode: record.currencyCode,
          rate: buyRate,
          type: RateType.BUY,
          sourceId: source.id,
          createdAt: record.timestamp,
        },
        {
          currencyCode: record.currencyCode,
          rate: record.sellRate,
          type: RateType.SELL,
          sourceId: source.id,
          createdAt: record.timestamp,
        },
      ],
    });

    await prisma.historicalRate.create({
      data: {
        currencyCode: record.currencyCode,
        buyRate,
        sellRate: record.sellRate,
        sourceId: source.id,
        recordedAt: record.timestamp,
      },
    });

    imported += 1;
  }

  return imported;
};

const importNewsRecords = async (records: ParsedNewsRecord[]) => {
  let imported = 0;

  for (const record of records) {
    await ensureCurrency(record.currencyCode);
    const source = await ensureSource(record.sourceName, SourceType.NEWS_AGENCY);
    await prisma.news.create({
      data: {
        title: record.title,
        content: record.content,
        category: record.category,
        countryCode: record.countryCode,
        currencyCode: record.currencyCode,
        importance: record.importance,
        sourceId: source.id,
        publishedAt: record.timestamp,
      },
    });
    imported += 1;
  }

  return imported;
};

const detectDatasetType = (fileName: string, content: string): 'RATES' | 'NEWS' => {
  const lowerName = fileName.toLowerCase();
  if (lowerName.includes('rate')) {
    return 'RATES';
  }
  if (lowerName.includes('news')) {
    return 'NEWS';
  }

  return /سعر الدولار|sellrate|buyrate|currencycode,rate|currency,rate/i.test(content) ? 'RATES' : 'NEWS';
};

export const importMarketData = async ({ fileName, content, datasetType, sourceName }: ImportRequest): Promise<ImportResult> => {
  const resolvedType = datasetType === 'AUTO' ? detectDatasetType(fileName, content) : datasetType;
  const extension = fileName.toLowerCase().split('.').pop() ?? 'txt';
  const importLog = await prisma.dataImport.create({
    data: {
      fileName,
      fileType: extension,
      datasetType: resolvedType,
      status: 'PROCESSING',
    },
  });

  try {
    let imported = 0;

    if (resolvedType === 'RATES') {
      const records =
        extension === 'csv'
          ? parseRatesCsv(content, sourceName ?? 'CSV Rate Import')
          : parseRatesMessages(parseWhatsAppExport(content), sourceName ?? 'WhatsApp Rates Import');
      imported = await importRateRecords(records);
    } else {
      const records =
        extension === 'csv'
          ? parseNewsCsv(content, sourceName ?? 'CSV News Import')
          : parseNewsMessages(parseWhatsAppExport(content), sourceName ?? 'WhatsApp News Import');
      imported = await importNewsRecords(records);
    }

    const notes = imported
      ? `Imported ${imported} ${resolvedType.toLowerCase()} records from ${fileName}.`
      : `No ${resolvedType.toLowerCase()} rows were recognized in ${fileName}.`;

    await prisma.dataImport.update({
      where: { id: importLog.id },
      data: {
        status: imported ? 'COMPLETED' : 'EMPTY',
        recordsImported: imported,
        notes,
      },
    });

    return {
      datasetType: resolvedType,
      recordsImported: imported,
      notes,
    };
  } catch (error) {
    await prisma.dataImport.update({
      where: { id: importLog.id },
      data: {
        status: 'FAILED',
        notes: error instanceof Error ? error.message : 'Import failed',
      },
    });
    throw error;
  }
};

interface IngestWhatsAppPayload {
  integrationId: string;
  sourceId?: string;
  sender?: string;
  text: string;
  receivedAt?: string | Date;
  messageId?: string;
  rawPayload?: Prisma.InputJsonValue;
}

export const ingestWhatsAppMessage = async ({
  integrationId,
  sourceId,
  sender,
  text,
  receivedAt,
  messageId,
  rawPayload,
}: IngestWhatsAppPayload) => {
  const integration = await prisma.whatsAppIntegration.findUnique({
    where: { id: integrationId },
    include: { sources: true },
  });

  if (!integration) {
    throw new Error('WhatsApp integration not found');
  }

  const source = sourceId ? integration.sources.find((item) => item.id === sourceId) ?? null : null;
  const receivedDate = receivedAt ? new Date(receivedAt) : new Date();
  const resolvedMessageId = messageId ?? hashText(`${integrationId}:${sourceId ?? 'none'}:${receivedDate.toISOString()}:${text}`);

  const message = await prisma.whatsAppMessage.upsert({
    where: {
      integrationId_messageId: {
        integrationId,
        messageId: resolvedMessageId,
      },
    },
    update: {
      messageText: text,
      sender: sender ?? 'bridge',
      receivedAt: receivedDate,
      rawPayload: rawPayload ?? {},
    },
    create: {
      integrationId,
      sourceId,
      sender: sender ?? 'bridge',
      messageId: resolvedMessageId,
      messageText: text,
      messageType: WhatsAppMessageType.TEXT,
      receivedAt: receivedDate,
      rawPayload: rawPayload ?? {},
    },
  });

  let importedRecords = 0;

  try {
    if (source?.type === WhatsAppSourceType.EXCHANGE_RATES) {
      importedRecords = await importRateRecords(
        parseRatesMessages(
          [{ timestamp: receivedDate, sender: sender ?? 'bridge', text }],
          source.name,
        ),
      );
    } else if (source?.type === WhatsAppSourceType.NEWS) {
      importedRecords = await importNewsRecords(
        parseNewsMessages(
          [{ timestamp: receivedDate, sender: sender ?? 'bridge', text }],
          source.name,
        ),
      );
    }

    await prisma.whatsAppMessage.update({
      where: { id: message.id },
      data: {
        processed: true,
        parseStatus: importedRecords ? WhatsAppParseStatus.PARSED : WhatsAppParseStatus.REVIEW,
        confidence: importedRecords ? 0.92 : 0.25,
      },
    });

    await prisma.processingLog.create({
      data: {
        messageId: message.id,
        action: 'INGEST',
        status: importedRecords ? 'SUCCESS' : 'NO_MATCH',
        executionTime: 0,
      },
    });

    await prisma.whatsAppIntegration.update({
      where: { id: integrationId },
      data: {
        status: WhatsAppIntegrationStatus.CONNECTED,
        lastSync: new Date(),
      },
    });
  } catch (error) {
    await prisma.whatsAppMessage.update({
      where: { id: message.id },
      data: {
        processed: true,
        parseStatus: WhatsAppParseStatus.FAILED,
        confidence: 0,
      },
    });
    await prisma.processingLog.create({
      data: {
        messageId: message.id,
        action: 'INGEST',
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Ingestion failed',
      },
    });
    throw error;
  }

  return { messageId: message.id, importedRecords };
};
