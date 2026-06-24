const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session && req.session.userId) return res.redirect('/');
  const error = req.query.error || null;
  res.send(loginPage(error));
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT * FROM dashboard.users WHERE username = $1', [username]
    );
    const user = result.rows[0];
    if (!user) return res.redirect('/login?error=1');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.redirect('/login?error=1');

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.name = user.name;
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.redirect('/login?error=1');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

function loginPage(error) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Login — Operações</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', sans-serif; background: #f4f5f9; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
.login-wrap { width: 100%; max-width: 400px; padding: 24px; }
.login-card { background: #fff; border-radius: 16px; border: 0.5px solid #e8eaf0; padding: 36px 32px; }
.logo { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; }
.logo-icon { width: 40px; height: 40px; background: linear-gradient(135deg, #7c3aed, #a855f7); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 20px; }
.logo-text { font-size: 16px; font-weight: 600; color: #1a1d2e; }
.logo-sub { font-size: 12px; color: #9ea3b5; margin-top: 1px; }
h2 { font-size: 20px; font-weight: 600; color: #1a1d2e; margin-bottom: 6px; }
.subtitle { font-size: 13px; color: #9ea3b5; margin-bottom: 28px; }
.field { margin-bottom: 16px; }
label { display: block; font-size: 12px; font-weight: 500; color: #4b5563; margin-bottom: 6px; }
input { width: 100%; padding: 10px 14px; border: 0.5px solid #e2e4eb; border-radius: 8px; font-size: 14px; font-family: 'Inter', sans-serif; color: #1a1d2e; outline: none; transition: border-color 0.15s; }
input:focus { border-color: #7c3aed; box-shadow: 0 0 0 3px rgba(124,58,237,0.08); }
.btn { width: 100%; padding: 11px; background: #7c3aed; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; font-family: 'Inter', sans-serif; cursor: pointer; margin-top: 8px; transition: background 0.15s; }
.btn:hover { background: #6d28d9; }
.error { background: #fef2f2; border: 0.5px solid #fecaca; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #dc2626; margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
</style>
</head>
<body>
<div class="login-wrap">
  <div class="login-card">
    <div class="logo">
      <div class="logo-icon"><i class="ti ti-bolt"></i></div>
      <div>
        <div class="logo-text">Operações</div>
        <div class="logo-sub">Loja Virtual</div>
      </div>
    </div>
    <h2>Bem-vindo</h2>
    <p class="subtitle">Entre com suas credenciais para acessar</p>
    ${error ? `<div class="error"><i class="ti ti-alert-circle"></i> Usuário ou senha incorretos</div>` : ''}
    <form method="POST" action="/login">
      <div class="field">
        <label>Usuário</label>
        <input type="text" name="username" placeholder="seu usuário" autocomplete="username" required>
      </div>
      <div class="field">
        <label>Senha</label>
        <input type="password" name="password" placeholder="••••••••" autocomplete="current-password" required>
      </div>
      <button type="submit" class="btn">Entrar</button>
    </form>
  </div>
</div>
</body>
</html>`;
}

module.exports = router;
