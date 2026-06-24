const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { requireAuth } = require('../../middleware/auth');
const { pool } = require('../../db');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Página principal do módulo
router.get('/', requireAuth, async (req, res) => {
  try {
    const logsResult = await pool.query(`
      SELECT * FROM dashboard.rastreios_log 
      ORDER BY created_at DESC LIMIT 20
    `);
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'success') as total_success,
        COUNT(*) FILTER (WHERE status = 'not_found') as total_not_found,
        COUNT(*) FILTER (WHERE status = 'error') as total_error,
        COUNT(DISTINCT batch_id) as total_lotes
      FROM dashboard.rastreios_log
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);
    const batchesResult = await pool.query(`
      SELECT 
        batch_id,
        MIN(created_at) as created_at,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'success') as success,
        COUNT(*) FILTER (WHERE status = 'not_found') as not_found,
        COUNT(*) FILTER (WHERE status = 'error') as error,
        date_from,
        date_to
      FROM dashboard.rastreios_log
      GROUP BY batch_id, date_from, date_to
      ORDER BY MIN(created_at) DESC
      LIMIT 10
    `);

    const stats = statsResult.rows[0];
    const logs = logsResult.rows;
    const batches = batchesResult.rows;

    res.send(rastreiosPage(stats, logs, batches));
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

// Upload e processamento da planilha
router.post('/processar', requireAuth, upload.single('planilha'), async (req, res) => {
  try {
    const { date_from, date_to } = req.body;

    if (!req.file) return res.json({ ok: false, error: 'Nenhum arquivo enviado' });
    if (!date_from || !date_to) return res.json({ ok: false, error: 'Datas obrigatórias' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (!rows.length) return res.json({ ok: false, error: 'Planilha vazia' });

    // Validar colunas obrigatórias
    const firstRow = rows[0];
    if (!firstRow.OBJETO || !firstRow.CEP) {
      return res.json({ ok: false, error: 'Planilha inválida. Colunas OBJETO e CEP são obrigatórias.' });
    }

    const batchId = `batch_${Date.now()}`;
    const results = { success: 0, not_found: 0, error: 0, items: [] };

    // Buscar pedidos da Shopify no período
    const shopifyOrders = await fetchShopifyOrders(date_from, date_to);

    for (const row of rows) {
      const rastreio = String(row.OBJETO || '').trim();
      const cep = String(row.CEP || '').replace(/\D/g, '');

      if (!rastreio || !cep) continue;

      try {
        // Filtrar pedidos pelo CEP
        const matches = shopifyOrders.filter(order => {
          const orderCep = String(order.shipping_address?.zip || '').replace(/\D/g, '');
          return orderCep === cep && !order.fulfillment_status;
        });

        if (matches.length === 0) {
          results.not_found++;
          results.items.push({ rastreio, cep, status: 'not_found', pedido: null, message: 'Nenhum pedido encontrado' });
          await logResult(pool, batchId, rastreio, cep, 'not_found', null, null, 'Nenhum pedido encontrado', date_from, date_to);
          continue;
        }

        // Pegar o mais antigo
        matches.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const order = matches[0];

        // Buscar fulfillment_order_id
        const fulfillmentOrderId = await getFulfillmentOrderId(order.id);
        if (!fulfillmentOrderId) {
          results.error++;
          results.items.push({ rastreio, cep, status: 'error', pedido: order.name, message: 'Erro ao obter fulfillment order' });
          await logResult(pool, batchId, rastreio, cep, 'error', order.id, order.name, 'Erro ao obter fulfillment order', date_from, date_to);
          continue;
        }

        // Vincular rastreio
        await createFulfillment(fulfillmentOrderId, rastreio);

        results.success++;
        results.items.push({ rastreio, cep, status: 'success', pedido: order.name, message: `Vinculado ao pedido ${order.name}` });
        await logResult(pool, batchId, rastreio, cep, 'success', order.id, order.name, `Vinculado ao pedido ${order.name}`, date_from, date_to);

        // Remover pedido da lista para não ser usado novamente
        const idx = shopifyOrders.findIndex(o => o.id === order.id);
        if (idx !== -1) shopifyOrders[idx].fulfillment_status = 'fulfilled';

      } catch (err) {
        results.error++;
        results.items.push({ rastreio, cep, status: 'error', pedido: null, message: err.message });
        await logResult(pool, batchId, rastreio, cep, 'error', null, null, err.message, date_from, date_to);
      }
    }

    // Atualizar status do módulo
    await pool.query(`UPDATE dashboard.modules SET status = 'active', updated_at = NOW() WHERE slug = 'rastreios'`);

    res.json({ ok: true, batchId, results });

  } catch (err) {
    console.error(err);
    res.json({ ok: false, error: err.message });
  }
});

async function fetchShopifyOrders(dateFrom, dateTo) {
  const SHOPIFY_URL = process.env.SHOPIFY_URL;
  const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;

  // Adiciona 1 dia ao date_to para incluir o dia inteiro
  const dateTo2 = new Date(dateTo);
  dateTo2.setDate(dateTo2.getDate() + 1);
  const dateToStr = dateTo2.toISOString().split('T')[0];

  let allOrders = [];
  let url = `${SHOPIFY_URL}/admin/api/2024-01/orders.json?status=any&fulfillment_status=unfulfilled&created_at_min=${dateFrom}&created_at_max=${dateToStr}&limit=250&fields=id,name,created_at,fulfillment_status,shipping_address`;

  while (url) {
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    const data = await response.json();
    allOrders = allOrders.concat(data.orders || []);

    // Paginação via Link header
    const linkHeader = response.headers.get('Link') || '';
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  return allOrders;
}

async function getFulfillmentOrderId(orderId) {
  const SHOPIFY_URL = process.env.SHOPIFY_URL;
  const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;

  const response = await fetch(`${SHOPIFY_URL}/admin/api/2024-01/orders/${orderId}/fulfillment_orders.json`, {
    headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
  });
  const data = await response.json();
  const open = (data.fulfillment_orders || []).find(fo => fo.status === 'open');
  return open ? open.id : null;
}

async function createFulfillment(fulfillmentOrderId, trackingNumber) {
  const SHOPIFY_URL = process.env.SHOPIFY_URL;
  const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;

  const response = await fetch(`${SHOPIFY_URL}/admin/api/2024-01/fulfillments.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fulfillment: {
        line_items_by_fulfillment_order: [{ fulfillment_order_id: fulfillmentOrderId }],
        tracking_info: {
          number: trackingNumber,
          company: 'Correios',
          url: 'https://rastreamento.correios.com.br/app/index.php'
        },
        notify_customer: true
      }
    })
  });
  const data = await response.json();
  if (!data.fulfillment) throw new Error(JSON.stringify(data.errors || 'Erro ao criar fulfillment'));
  return data.fulfillment;
}

async function logResult(pool, batchId, rastreio, cep, status, orderId, orderName, message, dateFrom, dateTo) {
  await pool.query(`
    INSERT INTO dashboard.rastreios_log 
    (batch_id, rastreio, cep, status, order_id, order_name, message, date_from, date_to)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [batchId, rastreio, cep, status, orderId, orderName, message, dateFrom, dateTo]);
}

function rastreiosPage(stats, logs, batches) {
  const batchesHtml = batches.length === 0
    ? `<div class="empty-state"><i class="ti ti-history"></i><p>Nenhum lote processado ainda</p></div>`
    : batches.map(b => `
      <div class="batch-item">
        <div class="batch-header">
          <div>
            <div class="batch-title">Lote ${new Date(b.created_at).toLocaleString('pt-BR')}</div>
            <div class="batch-period">Período: ${b.date_from ? new Date(b.date_from).toLocaleDateString('pt-BR') : '-'} até ${b.date_to ? new Date(b.date_to).toLocaleDateString('pt-BR') : '-'}</div>
          </div>
          <div class="batch-stats">
            <span class="bstat bstat-green"><i class="ti ti-check"></i> ${b.success}</span>
            <span class="bstat bstat-amber"><i class="ti ti-search"></i> ${b.not_found}</span>
            <span class="bstat bstat-red"><i class="ti ti-x"></i> ${b.error}</span>
          </div>
        </div>
      </div>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Rastreios — Operações</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css" rel="stylesheet">
<link rel="stylesheet" href="/css/main.css">
<link rel="stylesheet" href="/css/rastreios.css">
</head>
<body>
<div class="shell">
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-logo">
      <div class="logo-mark">
        <div class="logo-icon"><i class="ti ti-bolt"></i></div>
        <div><div class="logo-text">Operações</div><div class="logo-sub">Loja Virtual</div></div>
      </div>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-section">Geral</div>
      <a href="/" class="nav-item"><i class="ti ti-layout-dashboard"></i>Dashboard</a>
      <div class="nav-section">Módulos</div>
      <a href="/modulo/rastreios" class="nav-item active"><i class="ti ti-truck-delivery"></i>Rastreios<span class="nav-dot dot-green"></span></a>
      <a href="/modulo/whatsapp" class="nav-item"><i class="ti ti-brand-whatsapp"></i>WhatsApp<span class="nav-dot dot-muted"></span></a>
      <a href="/modulo/email" class="nav-item"><i class="ti ti-mail"></i>E-mail<span class="nav-dot dot-muted"></span></a>
      <div class="nav-section">Sistema</div>
      <a href="/configuracoes" class="nav-item"><i class="ti ti-settings"></i>Configurações</a>
    </nav>
    <div class="sidebar-footer">
      <div class="user-row">
        <div class="avatar">RL</div>
        <div class="user-info"><div class="user-name">Realiser</div><div class="user-role">Administrador</div></div>
        <a href="/logout"><i class="ti ti-logout" style="font-size:16px;color:#d1d5db"></i></a>
      </div>
    </div>
  </aside>
  <div class="overlay" id="overlay" onclick="closeSidebar()"></div>
  <div class="main">
    <div class="topbar">
      <div class="topbar-left">
        <button class="hamburger" onclick="toggleSidebar()"><i class="ti ti-menu-2"></i></button>
        <div>
          <div class="topbar-title">Módulo de Rastreios</div>
          <div class="topbar-sub">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
      </div>
      <div class="topbar-right">
        <div class="badge-live"><div class="pulse"></div>Ativo</div>
      </div>
    </div>
    <div class="content">

      <!-- MÉTRICAS -->
      <div class="metrics-row">
        <div class="metric-card">
          <div class="metric-top"><div class="metric-label">Vinculados (30 dias)</div><div class="metric-icon mi-green"><i class="ti ti-circle-check"></i></div></div>
          <div class="metric-value">${stats.total_success || 0}</div>
          <div class="metric-change change-up">com sucesso</div>
        </div>
        <div class="metric-card">
          <div class="metric-top"><div class="metric-label">Não encontrados</div><div class="metric-icon mi-amber"><i class="ti ti-search-off"></i></div></div>
          <div class="metric-value">${stats.total_not_found || 0}</div>
          <div class="metric-change change-warn">revisão manual</div>
        </div>
        <div class="metric-card">
          <div class="metric-top"><div class="metric-label">Erros</div><div class="metric-icon mi-red"><i class="ti ti-alert-circle"></i></div></div>
          <div class="metric-value">${stats.total_error || 0}</div>
          <div class="metric-change change-warn">nos últimos 30 dias</div>
        </div>
        <div class="metric-card">
          <div class="metric-top"><div class="metric-label">Lotes processados</div><div class="metric-icon mi-purple"><i class="ti ti-stack"></i></div></div>
          <div class="metric-value">${stats.total_lotes || 0}</div>
          <div class="metric-change change-neutral">nos últimos 30 dias</div>
        </div>
      </div>

      <!-- UPLOAD -->
      <div class="upload-section">
        <div class="upload-header">
          <div>
            <div class="section-title">Processar planilha dos Correios</div>
            <div class="upload-sub">Selecione o arquivo Excel e o período de busca dos pedidos na Shopify</div>
          </div>
        </div>

        <div class="upload-form" id="uploadForm">
          <div class="date-row">
            <div class="field-group">
              <label>Data inicial</label>
              <input type="date" id="dateFrom" required>
            </div>
            <div class="field-group">
              <label>Data final</label>
              <input type="date" id="dateTo" required>
            </div>
          </div>

          <div class="dropzone" id="dropzone" onclick="document.getElementById('fileInput').click()">
            <input type="file" id="fileInput" accept=".xlsx,.xls" style="display:none" onchange="handleFileSelect(this)">
            <div class="dropzone-icon"><i class="ti ti-file-spreadsheet"></i></div>
            <div class="dropzone-text">Clique para selecionar a planilha</div>
            <div class="dropzone-sub">Arquivos .xlsx ou .xls dos Correios</div>
          </div>

          <div id="fileSelected" style="display:none" class="file-selected">
            <i class="ti ti-file-check"></i>
            <span id="fileName"></span>
            <button onclick="clearFile()" class="clear-file"><i class="ti ti-x"></i></button>
          </div>

          <button class="btn-processar" id="btnProcessar" onclick="processar()" disabled>
            <i class="ti ti-player-play"></i>
            Processar rastreios
          </button>
        </div>

        <!-- PROGRESSO -->
        <div id="progressSection" style="display:none" class="progress-section">
          <div class="progress-header">
            <div class="progress-title">Processando...</div>
            <div class="progress-sub" id="progressSub">Aguarde enquanto os rastreios são vinculados</div>
          </div>
          <div class="progress-bar-wrap">
            <div class="progress-bar" id="progressBar"></div>
          </div>
        </div>

        <!-- RESULTADO -->
        <div id="resultSection" style="display:none" class="result-section">
          <div class="result-header">
            <div class="result-title">Resultado do processamento</div>
          </div>
          <div class="result-stats" id="resultStats"></div>
          <div class="result-list" id="resultList"></div>
        </div>
      </div>

      <!-- LOTES ANTERIORES -->
      <div class="section-block">
        <div class="section-header">
          <div class="section-title">Lotes anteriores</div>
          <a href="/modulo/rastreios/logs" class="section-link">Ver todos</a>
        </div>
        <div class="alerts-box">${batchesHtml}</div>
      </div>

    </div>
  </div>
</div>
<script src="/js/main.js"></script>
<script src="/js/rastreios.js"></script>
</body>
</html>`;
}

module.exports = router;
