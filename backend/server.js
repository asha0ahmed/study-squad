const express = require('express');
const pool = require('./db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const requireAuth = require('./middleware/auth');
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

app.post('/mentors', async (req, res) => {
  const { name, email, password, institution, groups } = req.body;

  if (!name || !email || !password || !institution) {
    return res.status(400).json({ error: 'Name, email, password, and institution are required.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  if (!Array.isArray(groups) || groups.length === 0) {
    return res.status(400).json({ error: 'At least one group (Science, Arts, or Commerce) is required.' });
  }

  const validGroups = ['Science', 'Arts', 'Commerce'];
  for (const g of groups) {
    if (!validGroups.includes(g)) {
      return res.status(400).json({ error: `Invalid group: ${g}. Must be Science, Arts, or Commerce.` });
    }
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const mentorResult = await pool.query(
      `INSERT INTO mentors (name, email, password_hash, institution)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, institution, approval_status, created_at`,
      [name, email, passwordHash, institution]
    );

    const mentor = mentorResult.rows[0];

    for (const g of groups) {
      await pool.query(
        `INSERT INTO mentor_groups (mentor_id, group_name) VALUES ($1, $2)`,
        [mentor.id, g]
      );
    }

    res.status(201).json({ ...mentor, groups });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A mentor with this email already exists.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong saving the mentor.' });
  }
});

app.post('/students/:id/subjects', requireAuth, async (req, res) => {
  const studentId = req.params.id;
     if (parseInt(studentId) !== req.student.studentId) {
     return res.status(403).json({ error: 'You can only edit your own subjects.' });
   }
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

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const result = await pool.query('SELECT * FROM students WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const student = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, student.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { studentId: student.id, email: student.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        academic_group: student.academic_group,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong logging in.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});