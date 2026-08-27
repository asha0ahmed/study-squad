const express = require('express');
const pool = require('./db');
const bcrypt = require('bcrypt');
const app = express();
const PORT = 3000;

app.use(express.json());

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

app.post('/students', async (req, res) => {
  const { name, email, password, institution, year, academic_group, aspirant_type } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO students (name, email, password_hash, institution, year, academic_group, aspirant_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, email, institution, year, academic_group, aspirant_type, matching_status, squad_id, created_at`,
      [name, email, passwordHash, institution, year, academic_group, aspirant_type]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A student with this email already exists.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong saving the student.' });
  }
});

app.post('/students/:id/subjects', async (req, res) => {
  const studentId = req.params.id;
  const { subjects } = req.body;

  if (!Array.isArray(subjects) || subjects.length === 0) {
    return res.status(400).json({ error: 'A non-empty list of subjects is required.' });
  }

  for (const s of subjects) {
    if (!s.subject_id || !s.proficiency || !s.improvement_priority) {
      return res.status(400).json({ error: 'Each subject needs subject_id, proficiency, and improvement_priority.' });
    }
  }

  try {
    const studentCheck = await pool.query('SELECT id FROM students WHERE id = $1', [studentId]);
    if (studentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    const savedSubjects = [];
    for (const s of subjects) {
      const result = await pool.query(
        `INSERT INTO student_subjects (student_id, subject_id, proficiency, improvement_priority)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (student_id, subject_id)
         DO UPDATE SET proficiency = $3, improvement_priority = $4
         RETURNING *`,
        [studentId, s.subject_id, s.proficiency, s.improvement_priority]
      );
      savedSubjects.push(result.rows[0]);
    }

    res.status(201).json(savedSubjects);
  } catch (err) {
    if (err.code === '23514') {
      return res.status(400).json({ error: 'Invalid proficiency (must be 1-5) or improvement_priority (must be Low/Medium/High).' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong saving subjects.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});