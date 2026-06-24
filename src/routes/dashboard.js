const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { pool } = require('../db');
const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const modulesResult = await pool.query(
      'SELECT * FROM dashboard.modules ORDER BY order_index ASC'
    );
    const notifResult = await pool.query(
      'SELECT * FROM dashboard.notifications ORDER BY created_at DESC LIMIT 10'
    );
    const unreadCount = await pool.query(
      'SELECT COUNT(*) FROM dashboard.notifications WHERE read = false'
    );

    const modules = modulesResult.rows;
    const notifications = notifResult.rows;
    const unread = parseInt(unreadCount.rows[0].count);

    res.send(dashboardPage(req.session.name, modules, notifications, unread));
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro interno');
  }
});

router.get('/modulo/:slug', requireAuth, async (req, res) => {
  try {
    const { slug } = req.params;
    const modResult = await pool.query(
      'SELECT * FROM dashboard.modules WHERE slug = $1', [slug]
    );
    if (!modResult.rows.length) return res.redirect('/');
    const mod = modResult.rows[0];

    const logsResult = await pool.query(
      'SELECT * FROM dashboard.activity_logs WHERE module_slug = $1 ORDER BY created_at DESC LIMIT 50',
      [slug]
    );
    const notifResult = await pool.query(
      'SELECT * FROM dashboard.notifications WHERE module_slug = $1 ORDER BY created_at DESC LIMIT 20',
      [slug]
    );
    const unreadCount = await pool.query(
      'SELECT COUNT(*) FROM dashboard.notifications WHERE read = false'
    );

    const unread = parseInt(unreadCount.rows[0].count);
    res.send(modulePage(req.session.name, mod, logsResult.rows, notifResult.rows, unread));
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

function formatTime(date) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'agora mesmo';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  return d.toLocaleDateString('pt-BR');
}

function statusBadge(status) {
  if (status === 'active') return `<span class="badge badge-active">Ativo</span>`;
  if (status === 'inactive') return `<span class="badge badge-soon">Em breve</span>`;
  if (status === 'error') return `<span class="badge badge-error">Erro</span>`;
  return `<span class="badge badge-soon">Inativo</span>`;
}

function moduleIcon(slug) {
  const icons = { rastreios: 'mi-purple', whatsapp: 'mi-green', email: 'mi-blue' };
  return icons[slug] || 'mi-gray';
}

function notifIcon(type) {
  if (type === 'warning') return `<div class="alert-dot-wrap adw-amber"><i class="ti ti-alert-circle"></i></div>`;
  if (type === 'success') return `<div class="alert-dot-wrap adw-green"><i class="ti ti-circle-check"></i></div>`;
  if (type === 'error') return `<div class="alert-dot-wrap adw-red"><i class="ti ti-x"></i></div>`;
  return `<div class="alert-dot-wrap adw-blue"><i class="ti ti-info-circle"></i></div>`;
}

function baseLayout(name, unread, content, currentSlug) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Operações — Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css" rel="stylesheet">
<link rel="stylesheet" href="/css/main.css">
</head>
<body>
<div class="shell">
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-logo">
      <div class="logo-mark">
        <div class="logo-icon"><i class="ti ti-bolt"></i></div>
        <div>
          <div class="logo-text">Operações</div>
          <div class="logo-sub">Loja Virtual</div>
        </div>
      </div>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-section">Geral</div>
      <a href="/" class="nav-item ${currentSlug === 'home' ? 'active' : ''}">
        <i class="ti ti-layout-dashboard"></i>
        Dashboard
      </a>
      <div class="nav-section">Módulos</div>
      <a href="/modulo/rastreios" class="nav-item ${currentSlug === 'rastreios' ? 'active' : ''}">
        <i class="ti ti-truck-delivery"></i>
        Rastreios
        <span class="nav-dot dot-green"></span>
      </a>
      <a href="/modulo/whatsapp" class="nav-item ${currentSlug === 'whatsapp' ? 'active' : ''}">
        <i class="ti ti-brand-whatsapp"></i>
        WhatsApp
        <span class="nav-dot dot-muted"></span>
      </a>
      <a href="/modulo/email" class="nav-item ${currentSlug === 'email' ? 'active' : ''}">
        <i class="ti ti-mail"></i>
        E-mail
        <span class="nav-dot dot-muted"></span>
      </a>
      <div class="nav-section">Sistema</div>
      <a href="/configuracoes" class="nav-item ${currentSlug === 'configuracoes' ? 'active' : ''}">
        <i class="ti ti-settings"></i>
        Configurações
      </a>
    </nav>
    <div class="sidebar-footer">
      <div class="user-row">
        <div class="avatar">${(name || 'U').substring(0, 2).toUpperCase()}</div>
        <div class="user-info">
          <div class="user-name">${name || 'Usuário'}</div>
          <div class="user-role">Administrador</div>
        </div>
        <a href="/logout" title="Sair"><i class="ti ti-logout" style="font-size:16px;color:#d1d5db"></i></a>
      </div>
    </div>
  </aside>

  <div class="overlay" id="overlay" onclick="closeSidebar()"></div>

  <div class="main">
    <div class="topbar">
      <div class="topbar-left">
        <button class="hamburger" onclick="toggleSidebar()"><i class="ti ti-menu-2"></i></button>
        <div>
          <div class="topbar-title">${currentSlug === 'home' ? 'Visão Geral' : ''}</div>
          <div class="topbar-sub">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
      </div>
      <div class="topbar-right">
        <div class="badge-live"><div class="pulse"></div>Sistema ativo</div>
        <div class="notif-btn" onclick="window.location='/notificacoes'">
          <i class="ti ti-bell"></i>
          ${unread > 0 ? `<span class="notif-count">${unread}</span>` : ''}
        </div>
      </div>
    </div>
    <div class="content">
      ${content}
    </div>
  </div>
</div>
<script src="/js/main.js"></script>
</body>
</html>`;
}

function dashboardPage(name, modules, notifications, unread) {
  const activeModules = modules.filter(m => m.status === 'active').length;

  const modulesHtml = modules.map(mod => {
    const iconClass = moduleIcon(mod.slug);
    return `
    <a href="/modulo/${mod.slug}" class="mod-card ${mod.status === 'active' ? 'featured' : ''}" style="text-decoration:none">
      <div class="mod-card-top">
        <div class="mod-icon ${iconClass}"><i class="ti ${mod.icon}"></i></div>
        ${statusBadge(mod.status)}
      </div>
      <div class="mod-name">${mod.name}</div>
      <div class="mod-desc">${mod.description}</div>
      <div class="mod-footer">
        <div>
          <div class="mod-stat-label">Status</div>
          <div class="mod-stat-value ${mod.status !== 'active' ? 'text-muted' : ''}">${mod.status === 'active' ? 'Operacional' : 'Não iniciado'}</div>
        </div>
        <div class="mod-btn">Abrir <i class="ti ti-arrow-right" style="font-size:13px"></i></div>
      </div>
    </a>`;
  }).join('');

  const notifsHtml = notifications.length === 0
    ? `<div class="empty-state"><i class="ti ti-bell-off"></i><p>Nenhuma notificação ainda</p></div>`
    : notifications.slice(0, 5).map(n => `
    <div class="alert-item ${!n.read ? 'unread' : ''}" onclick="markRead(${n.id}, this)">
      ${notifIcon(n.type)}
      <div class="alert-text">
        <div class="alert-title">${n.title}</div>
        ${n.message ? `<div class="alert-sub">${n.message}</div>` : ''}
      </div>
      <div class="alert-time">${formatTime(n.created_at)}</div>
    </div>`).join('');

  const content = `
    <div class="metrics-row">
      <div class="metric-card">
        <div class="metric-top">
          <div class="metric-label">Módulos ativos</div>
          <div class="metric-icon mi-purple"><i class="ti ti-apps"></i></div>
        </div>
        <div class="metric-value">${activeModules}</div>
        <div class="metric-change change-neutral">de ${modules.length} módulos</div>
      </div>
      <div class="metric-card">
        <div class="metric-top">
          <div class="metric-label">Notificações</div>
          <div class="metric-icon mi-amber"><i class="ti ti-bell"></i></div>
        </div>
        <div class="metric-value">${unread}</div>
        <div class="metric-change ${unread > 0 ? 'change-warn' : 'change-up'}">${unread > 0 ? 'Aguardando atenção' : 'Tudo em dia'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-top">
          <div class="metric-label">Sistema</div>
          <div class="metric-icon mi-green"><i class="ti ti-shield-check"></i></div>
        </div>
        <div class="metric-value" style="font-size:18px;padding-top:4px">Online</div>
        <div class="metric-change change-up">Todos os serviços operacionais</div>
      </div>
      <div class="metric-card">
        <div class="metric-top">
          <div class="metric-label">Último acesso</div>
          <div class="metric-icon mi-blue"><i class="ti ti-clock"></i></div>
        </div>
        <div class="metric-value" style="font-size:18px;padding-top:4px">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
        <div class="metric-change change-neutral">Agora mesmo</div>
      </div>
    </div>

    <div class="section-block">
      <div class="section-header">
        <div class="section-title">Módulos</div>
      </div>
      <div class="modules-grid">${modulesHtml}</div>
    </div>

    <div class="section-block">
      <div class="section-header">
        <div class="section-title">Últimas notificações</div>
        <a href="/notificacoes" class="section-link">Ver todas</a>
      </div>
      <div class="alerts-box">${notifsHtml}</div>
    </div>
  `;

  return baseLayout(name, unread, content, 'home');
}

function modulePage(name, mod, logs, notifications, unread) {
  const iconClass = moduleIcon(mod.slug);

  const logsHtml = logs.length === 0
    ? `<div class="empty-state"><i class="ti ti-history"></i><p>Nenhuma atividade registrada ainda</p></div>`
    : logs.map(log => `
    <div class="log-item">
      <div class="log-dot ${log.event_type === 'error' ? 'dot-red' : log.event_type === 'success' ? 'dot-green' : 'dot-blue'}"></div>
      <div class="log-text">
        <div class="log-desc">${log.description}</div>
        <div class="log-time">${formatTime(log.created_at)}</div>
      </div>
    </div>`).join('');

  const notifsHtml = notifications.length === 0
    ? `<div class="empty-state"><i class="ti ti-bell-off"></i><p>Nenhuma notificação para este módulo</p></div>`
    : notifications.map(n => `
    <div class="alert-item ${!n.read ? 'unread' : ''}" onclick="markRead(${n.id}, this)">
      ${notifIcon(n.type)}
      <div class="alert-text">
        <div class="alert-title">${n.title}</div>
        ${n.message ? `<div class="alert-sub">${n.message}</div>` : ''}
      </div>
      <div class="alert-time">${formatTime(n.created_at)}</div>
    </div>`).join('');

  const content = `
    <div class="module-header">
      <div class="module-header-left">
        <a href="/" class="back-btn"><i class="ti ti-arrow-left"></i> Voltar</a>
        <div class="mod-icon ${iconClass}" style="width:48px;height:48px;font-size:24px;border-radius:12px"><i class="ti ${mod.icon}"></i></div>
        <div>
          <h1 class="module-title">${mod.name}</h1>
          <p class="module-desc">${mod.description}</p>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        ${statusBadge(mod.status)}
      </div>
    </div>

    <div class="metrics-row">
      <div class="metric-card">
        <div class="metric-top">
          <div class="metric-label">Status</div>
          <div class="metric-icon ${iconClass}"><i class="ti ${mod.icon}"></i></div>
        </div>
        <div class="metric-value" style="font-size:18px;padding-top:4px">${mod.status === 'active' ? 'Ativo' : 'Inativo'}</div>
        <div class="metric-change ${mod.status === 'active' ? 'change-up' : 'change-neutral'}">${mod.status === 'active' ? 'Funcionando normalmente' : 'Aguardando configuração'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-top">
          <div class="metric-label">Atividades</div>
          <div class="metric-icon mi-blue"><i class="ti ti-activity"></i></div>
        </div>
        <div class="metric-value">${logs.length}</div>
        <div class="metric-change change-neutral">registros no histórico</div>
      </div>
      <div class="metric-card">
        <div class="metric-top">
          <div class="metric-label">Notificações</div>
          <div class="metric-icon mi-amber"><i class="ti ti-bell"></i></div>
        </div>
        <div class="metric-value">${notifications.filter(n => !n.read).length}</div>
        <div class="metric-change ${notifications.filter(n => !n.read).length > 0 ? 'change-warn' : 'change-up'}">não lidas</div>
      </div>
      <div class="metric-card">
        <div class="metric-top">
          <div class="metric-label">Criado em</div>
          <div class="metric-icon mi-green"><i class="ti ti-calendar"></i></div>
        </div>
        <div class="metric-value" style="font-size:16px;padding-top:6px">${new Date(mod.created_at).toLocaleDateString('pt-BR')}</div>
        <div class="metric-change change-neutral">data de criação</div>
      </div>
    </div>

    <div class="two-col">
      <div class="section-block">
        <div class="section-header">
          <div class="section-title">Histórico de atividades</div>
        </div>
        <div class="alerts-box log-box">${logsHtml}</div>
      </div>
      <div class="section-block">
        <div class="section-header">
          <div class="section-title">Notificações do módulo</div>
        </div>
        <div class="alerts-box">${notifsHtml}</div>
      </div>
    </div>
  `;

  return baseLayout(name, unread, content, mod.slug);
}

module.exports = router;
