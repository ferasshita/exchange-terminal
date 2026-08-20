import crypto from 'crypto';

import { Router } from 'express';
import { WhatsAppIntegrationStatus, WhatsAppSourceType } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { ingestWhatsAppMessage } from '../services/market-ingestion';
import { HttpError } from '../utils/http';
import { getPagination } from '../utils/pagination';

const router = Router();
const webhookRouter = Router();

const integrationSchema = z.object({
  name: z.string().min(2),
  businessAccountId: z.string().default('channel-bridge'),
  phoneNumberId: z.string().default('channel-bridge'),
  encryptedAccessToken: z.string().default('managed-by-bridge'),
});

const sourceSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  type: z.nativeEnum(WhatsAppSourceType),
  priority: z.coerce.number().int().min(1).max(10).default(5),
  active: z.boolean().default(true),
});

const webhookSchema = z.object({
  sourceId: z.string().optional(),
  sender: z.string().optional(),
  text: z.string().min(1),
  messageId: z.string().optional(),
  receivedAt: z.string().optional(),
  rawPayload: z.unknown().optional(),
});

router.get('/integrations', async (req, res, next) => {
  try {
    const { skip, page, pageSize } = getPagination(req.query as Record<string, unknown>);
    const userId = req.user?.role === 'ADMIN' ? (req.query.userId as string | undefined) : req.user?.id;

    const where = userId ? { userId } : {};
    const [items, total] = await Promise.all([
      prisma.whatsAppIntegration.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          sources: true,
          _count: { select: { messages: true } },
        },
      }),
      prisma.whatsAppIntegration.count({ where }),
    ]);

    return res.json({ items, total, page, pageSize });
  } catch (error) {
    return next(error);
  }
});

router.post('/integrations', async (req, res, next) => {
  try {
    if (!req.user) {
      throw new HttpError(401, 'Authentication required');
    }

    const payload = integrationSchema.parse(req.body);
    const item = await prisma.whatsAppIntegration.create({
      data: {
        ...payload,
        userId: req.user.id,
        verifyToken: crypto.randomBytes(24).toString('hex'),
        status: WhatsAppIntegrationStatus.WAITING,
      },
    });
    return res.status(201).json(item);
  } catch (error) {
    return next(error);
  }
});

router.post('/integrations/:integrationId/sources', async (req, res, next) => {
  try {
    const payload = sourceSchema.parse(req.body);
    const item = await prisma.whatsAppSource.create({
      data: {
        integrationId: req.params.integrationId,
        ...payload,
      },
    });
    return res.status(201).json(item);
  } catch (error) {
    return next(error);
  }
});

router.get('/integrations/:integrationId/messages', async (req, res, next) => {
  try {
    const { skip, page, pageSize } = getPagination(req.query as Record<string, unknown>);
    const [items, total] = await Promise.all([
      prisma.whatsAppMessage.findMany({
        where: { integrationId: req.params.integrationId },
        include: { source: true, logs: true },
        skip,
        take: pageSize,
        orderBy: { receivedAt: 'desc' },
      }),
      prisma.whatsAppMessage.count({ where: { integrationId: req.params.integrationId } }),
    ]);

    return res.json({ items, total, page, pageSize });
  } catch (error) {
    return next(error);
  }
});

webhookRouter.post('/:integrationId', async (req, res, next) => {
  try {
    const payload = webhookSchema.parse(req.body);
    const integration = await prisma.whatsAppIntegration.findUnique({
      where: { id: req.params.integrationId },
    });

    if (!integration) {
      throw new HttpError(404, 'Integration not found');
    }

    const verifyToken = req.header('x-whatsapp-verify-token');
    if (!verifyToken || verifyToken !== integration.verifyToken) {
      throw new HttpError(401, 'Invalid WhatsApp verify token');
    }

    const result = await ingestWhatsAppMessage({
      integrationId: integration.id,
      sourceId: payload.sourceId,
      sender: payload.sender,
      text: payload.text,
      receivedAt: payload.receivedAt,
      messageId: payload.messageId,
      rawPayload: (payload.rawPayload ?? {}) as Record<string, unknown>,
    });

    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
});

export default router;
export { webhookRouter };
