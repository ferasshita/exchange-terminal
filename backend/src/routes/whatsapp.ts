import { Router } from 'express';
import { WhatsAppIntegrationStatus, WhatsAppSourceType } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { ingestRealtimeWhatsAppMessage } from '../services/ingestion';
import { HttpError } from '../utils/http';

const router = Router();

const integrationSchema = z.object({
  name: z.string().min(2),
  businessAccountId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  encryptedAccessToken: z.string().min(1),
  verifyToken: z.string().min(1),
});

const sourceSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  type: z.nativeEnum(WhatsAppSourceType),
  inviteCode: z.string().optional(),
  channelJid: z.string().optional(),
  priority: z.coerce.number().int().min(1).max(10).optional(),
  active: z.boolean().optional(),
  syncEnabled: z.boolean().optional(),
});

router.get('/integrations', async (req, res, next) => {
  try {
    const items = await prisma.whatsAppIntegration.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      include: { sources: true },
    });
    return res.json({ items });
  } catch (error) {
    return next(error);
  }
});

router.post('/integrations', async (req, res, next) => {
  try {
    const payload = integrationSchema.parse(req.body);
    const item = await prisma.whatsAppIntegration.create({
      data: {
        ...payload,
        userId: req.user!.id,
        status: WhatsAppIntegrationStatus.WAITING,
      },
    });
    return res.status(201).json(item);
  } catch (error) {
    return next(error);
  }
});

router.post('/integrations/:id/connect', async (req, res, next) => {
  try {
    const integration = await prisma.whatsAppIntegration.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!integration) throw new HttpError(404, 'Integration not found');

    const item = await prisma.whatsAppIntegration.update({
      where: { id: integration.id },
      data: { status: WhatsAppIntegrationStatus.CONNECTED, lastSync: new Date() },
    });

    return res.json({
      integration: item,
      message: 'Integration marked as connected; start your connector to push realtime channel messages to /whatsapp/messages',
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/integrations/:id/sources', async (req, res, next) => {
  try {
    const payload = sourceSchema.parse(req.body);
    const integration = await prisma.whatsAppIntegration.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!integration) throw new HttpError(404, 'Integration not found');

    const source = await prisma.whatsAppSource.create({
      data: {
        integrationId: integration.id,
        ...payload,
      },
    });

    return res.status(201).json(source);
  } catch (error) {
    return next(error);
  }
});

const messageSchema = z.object({
  integrationId: z.string().min(1),
  sourceId: z.string().optional(),
  messageId: z.string().min(1),
  sender: z.string().min(1),
  text: z.string().min(1),
  receivedAt: z.coerce.date().optional(),
  payload: z.unknown().optional(),
});

router.post('/messages', async (req, res, next) => {
  try {
    const payload = messageSchema.parse(req.body);

    const message = await ingestRealtimeWhatsAppMessage({
      integrationId: payload.integrationId,
      sourceId: payload.sourceId,
      messageId: payload.messageId,
      sender: payload.sender,
      text: payload.text,
      receivedAt: payload.receivedAt ?? new Date(),
      payload: payload.payload ?? { text: payload.text },
    });

    await prisma.whatsAppIntegration.update({
      where: { id: payload.integrationId },
      data: { lastSync: new Date(), status: WhatsAppIntegrationStatus.CONNECTED },
    });

    if (payload.sourceId) {
      await prisma.whatsAppSource.update({
        where: { id: payload.sourceId },
        data: { lastSyncAt: new Date(), lastError: null },
      });
    }

    return res.status(201).json({ id: message.id, parseStatus: message.parseStatus });
  } catch (error) {
    if (req.body?.sourceId) {
      await prisma.whatsAppSource.updateMany({
        where: { id: String(req.body.sourceId) },
        data: { lastError: error instanceof Error ? error.message : 'Realtime ingestion failed' },
      });
    }
    return next(error);
  }
});

export default router;
