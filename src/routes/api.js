const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { pool } = require('../db');
const router = express.Router();

router.post('/notifications/read/:id', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE dashboard.notifications SET read = true WHERE id = $1',
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao marcar notificação' });
  }
});

router.post('/notifications/read-all', requireAuth, async (req, res) => {
  try {
    await pool.query('UPDATE dashboard.notifications SET read = true WHERE read = false');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao marcar notificações' });
  }
});

router.post('/modules/:slug/toggle', requireAuth, async (req, res) => {
  try {
    const { slug } = req.params;
    const current = await pool.query(
      'SELECT status FROM dashboard.modules WHERE slug = $1', [slug]
    );
    if (!current.rows.length) return res.status(404).json({ error: 'Módulo não encontrado' });
    const newStatus = current.rows[0].status === 'active' ? 'inactive' : 'active';
    await pool.query(
      'UPDATE dashboard.modules SET status = $1, updated_at = NOW() WHERE slug = $2',
      [newStatus, slug]
    );
    res.json({ ok: true, status: newStatus });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao alternar módulo' });
  }
});

router.post('/logs', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  try {
    const { module_slug, event_type, description, metadata } = req.body;
    await pool.query(
      'INSERT INTO dashboard.activity_logs (module_slug, event_type, description, metadata) VALUES ($1, $2, $3, $4)',
      [module_slug, event_type || 'info', description, metadata ? JSON.stringify(metadata) : null]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao registrar log' });
  }
});

router.post('/notify', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  try {
    const { module_slug, type, title, message } = req.body;
    await pool.query(
      'INSERT INTO dashboard.notifications (module_slug, type, title, message) VALUES ($1, $2, $3, $4)',
      [module_slug, type || 'info', title, message || null]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar notificação' });
  }
});

module.exports = router;
