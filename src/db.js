const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS dashboard`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dashboard.sessions (
        sid VARCHAR NOT NULL COLLATE "default",
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL,
        CONSTRAINT sessions_pkey PRIMARY KEY (sid)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS sessions_expire_idx ON dashboard.sessions (expire)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dashboard.users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(200),
        role VARCHAR(50) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dashboard.modules (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        icon VARCHAR(100),
        status VARCHAR(50) DEFAULT 'inactive',
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dashboard.notifications (
        id SERIAL PRIMARY KEY,
        module_slug VARCHAR(100),
        type VARCHAR(50) DEFAULT 'info',
        title VARCHAR(300) NOT NULL,
        message TEXT,
        read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dashboard.activity_logs (
        id SERIAL PRIMARY KEY,
        module_slug VARCHAR(100),
        event_type VARCHAR(100),
        description TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const bcrypt = require('bcryptjs');
    const username = process.env.ADMIN_USER || 'realiser';
    const password = process.env.ADMIN_PASSWORD || '80295192';
    const hash = await bcrypt.hash(password, 10);

    await client.query(`
      INSERT INTO dashboard.users (username, password_hash, name, role)
      VALUES ($1, $2, $3, 'admin')
      ON CONFLICT (username) DO NOTHING
    `, [username, hash, 'Realiser']);

    const modules = [
      { slug: 'rastreios', name: 'Rastreios', description: 'Vincula automaticamente os códigos dos Correios aos pedidos da Shopify', icon: 'ti-truck-delivery', status: 'inactive', order_index: 1 },
      { slug: 'whatsapp', name: 'Agente WhatsApp', description: 'Atendimento automático via WhatsApp integrado à Shopify', icon: 'ti-brand-whatsapp', status: 'inactive', order_index: 2 },
      { slug: 'email', name: 'Agente E-mail', description: 'Atendimento automático via Gmail integrado à Shopify', icon: 'ti-mail', status: 'inactive', order_index: 3 }
    ];

    for (const mod of modules) {
      await client.query(`
        INSERT INTO dashboard.modules (slug, name, description, icon, status, order_index)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (slug) DO NOTHING
      `, [mod.slug, mod.name, mod.description, mod.icon, mod.status, mod.order_index]);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS dashboard.rastreios_log (
        id SERIAL PRIMARY KEY,
        batch_id VARCHAR(100),
        rastreio VARCHAR(100),
        cep VARCHAR(20),
        status VARCHAR(50),
        order_id BIGINT,
        order_name VARCHAR(50),
        message TEXT,
        date_from DATE,
        date_to DATE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('Banco de dados inicializado com sucesso');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
