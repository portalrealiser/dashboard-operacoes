require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const { pool, initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new pgSession({ pool, tableName: 'sessions', schemaName: 'dashboard' }),
  secret: process.env.SESSION_SECRET || 'dashboard-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

const authRouter = require('./routes/auth');
const dashboardRouter = require('./routes/dashboard');
const apiRouter = require('./routes/api');
const rastreiosRouter = require('./routes/modules/rastreios');

app.use('/', authRouter);
app.use('/', dashboardRouter);
app.use('/api', apiRouter);
app.use('/modulo/rastreios', rastreiosRouter);

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Dashboard rodando na porta ${PORT}`);
  });
}).catch(err => {
  console.error('Erro ao inicializar banco de dados:', err);
  process.exit(1);
});
