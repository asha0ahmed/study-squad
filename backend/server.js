const express = require('express');
const pool = require('./db');
const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.send('Study Squad backend is running!');
});

app.get('/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.send(`Database connected! Server time is: ${result.rows[0].now}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Database connection failed. Check the terminal for the error.');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});