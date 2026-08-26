-- Students table: stores each student's basic profile
CREATE TABLE students (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  institution VARCHAR(150),
  year VARCHAR(20),
  academic_group VARCHAR(50),
  aspirant_type VARCHAR(50),
  matching_status VARCHAR(20) DEFAULT 'not_started',
  squad_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);