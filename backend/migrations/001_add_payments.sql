-- Migration: add payments (mentor-fee subscription) table.
-- Safe to run against the existing live database -- does not touch or
-- drop any existing table, and is safe to re-run (IF NOT EXISTS).
--
-- Run with:
--   psql -U postgres -d studysquad -f migrations/001_add_payments.sql

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  plan VARCHAR(20) NOT NULL CHECK (plan IN ('1_month', '6_month')),
  amount INTEGER NOT NULL,
  method VARCHAR(20) NOT NULL CHECK (method IN ('nagad', 'bkash')),
  sender_phone VARCHAR(20) NOT NULL,
  trx_id VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
