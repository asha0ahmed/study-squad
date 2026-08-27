// One-time setup script for Task 36.
// Run this once with: node create-coverage-table.js
// It just adds the new squad_subject_coverage table to your existing database.
// Safe to run more than once — it won't error if the table already exists.

const pool = require('./db');

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS squad_subject_coverage (
        id SERIAL PRIMARY KEY,
        squad_id INTEGER NOT NULL REFERENCES squads(id),
        student_id INTEGER NOT NULL REFERENCES students(id),
        subject_id INTEGER NOT NULL REFERENCES subjects(id),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (squad_id, student_id, subject_id)
      );
    `);
    console.log('Done! squad_subject_coverage table is ready.');
  } catch (err) {
    console.error('Something went wrong:', err);
  } finally {
    await pool.end();
  }
}

run();