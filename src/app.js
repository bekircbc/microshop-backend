// src/app.js
const express = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getImageUrl } = require('./config/s3');
const { verifyToken, JWT_SECRET } = require('./middleware/auth');

const app = express();
app.use(express.json());

const port = process.env.PORT || 3000;

// Postgres & Redis Connections
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'postgresql.microshop.svc.cluster.local',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'MicroshopPassword123!',
  database: process.env.POSTGRES_DB || 'microshop_db',
  port: 5432,
});

const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis-master.microshop.svc.cluster.local',
  password: process.env.REDIS_PASSWORD || 'RedisPassword123!',
  port: 6379,
});

// Initialize Database Tables
async function initDB() {
  try {
    // Users Table (for JWT authentication)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Products Table (stores S3 image keys)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        image_key VARCHAR(255) NOT NULL
      );
    `);

    // Seed Sample Products
    const res = await pool.query('SELECT COUNT(*) FROM products');
    if (parseInt(res.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO products (name, price, image_key) VALUES 
        ('DevOps Hoodie', 49.99, 'hoodie.jpg'),
        ('Kubernetes Mug', 14.99, 'mug.jpg'),
        ('Docker Sticker Pack', 5.99, 'stickers.jpg');
      `);
      console.log('Sample products with S3 image keys initialized.');
    }
  } catch (err) {
    console.error('DB Initialization Error:', err);
  }
}
initDB();

// --- AUTH ENDPOINTS ---

// User Registration
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email',
      [email, hashedPassword]
    );
    res.status(201).json({ message: 'User created successfully', user: result.rows[0] });
  } catch (err) {
    res.status(400).json({ error: 'Email already in use or invalid input' });
  }
});

// User Login (Generates JWT)
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const user = userRes.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- PRODUCT ENDPOINTS ---

// Public Products Listing (with S3 URLs)
app.get('/api/products', async (req, res) => {
  try {
    // 1. Check Redis Cache First
    const cachedProducts = await redis.get('all_products');
    if (cachedProducts) {
      return res.json({ source: 'redis-cache', data: JSON.parse(cachedProducts) });
    }

    // 2. Fetch from Database on Cache Miss
    const result = await pool.query('SELECT * FROM products');
    
    // 3. Format S3 Image URLs
    const formattedProducts = result.rows.map(product => ({
      ...product,
      image_url: getImageUrl(product.image_key)
    }));

    // 4. Save to Redis with 60s TTL
    await redis.set('all_products', JSON.stringify(formattedProducts), 'EX', 60);

    return res.json({ source: 'postgresql-database', data: formattedProducts });
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Protected Endpoint Example (Requires valid JWT Token)
app.get('/api/profile', verifyToken, (req, res) => {
  res.json({ message: 'Access granted to protected profile', user: req.user });
});

app.listen(port, () => console.log(`Backend server running on port ${port}.`));