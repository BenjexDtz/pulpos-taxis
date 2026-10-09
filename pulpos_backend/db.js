const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
});

// Sin este manejador, una conexión inactiva que PostgreSQL cierra (reinicio, corte) tumba el proceso.
pool.on('error', (err) => console.error('⚠️ Se perdió una conexión inactiva con PostgreSQL:', err.message));

module.exports = pool;