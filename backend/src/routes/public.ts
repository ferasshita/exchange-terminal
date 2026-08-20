import { Router } from 'express';

import { getPublicMarketDashboard } from '../services/forecasting';

const router = Router();

router.get('/dashboard', async (_req, res, next) => {
  try {
    const payload = await getPublicMarketDashboard();
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

export default router;
