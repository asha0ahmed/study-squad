const express = require('express');
const cors = require('cors');
const pool = require('./db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const requireAuth = require('./middleware/auth');
const { findAutoSquad } = require('./utils/matching');
const app = express();
const PORT = 3000;

// Without this, every request from the frontend (a different origin --
// e.g. localhost:3001 -- than this server's localhost:3000) is blocked by
// the browser's CORS policy before it even reaches these routes. Tools
// like curl don't enforce CORS, so this gap doesn't show up in
// server-to-server testing -- only in an actual browser.
app.use(cors());
app.use(express.json());

// Task 36: looks up which student covers which subject(s) in a squad.
// Returns a map like: { 12: ['Physics'], 15: ['Chemistry', 'Biology'] }
// so it can be merged onto a squad's member list.
async function getSubjectCoverage(squadId) {
  const result = await pool.query(
    `SELECT ssc.student_id, sub.name AS subject_name
     FROM squad_subject_coverage ssc
     JOIN subjects sub ON sub.id = ssc.subject_id
     WHERE ssc.squad_id = $1`,
    [squadId]
  );

  const coverageByStudent = {};
  for (const row of result.rows) {
    if (!coverageByStudent[row.student_id]) {
      coverageByStudent[row.student_id] = [];
    }
    coverageByStudent[row.student_id].push(row.subject_name);
  }
  return coverageByStudent;
}

// Attaches a "covers" field (array of subject names, or [] if none)
// onto each member in a members list.
function attachCoverage(members, coverageByStudent) {
  return members.map(m => ({
    ...m,
    covers: coverageByStudent[m.student_id] || []
  }));
}

// Task 37: how many hours a squad is allowed to sit at 'suggested'
// (i.e. never reaching 4 confirmations) before it's cleaned up.
// Can be overridden via .env for testing, e.g. SQUAD_EXPIRY_HOURS=0.01
const SQUAD_EXPIRY_HOURS = process.env.SQUAD_EXPIRY_HOURS
  ? parseFloat(process.env.SQUAD_EXPIRY_HOURS)
  : 48;

// Finds squads that have been stuck at 'suggested' longer than
// SQUAD_EXPIRY_HOURS, marks them 'expired', removes their members,
// and resets those students back to 'not_started' so they can be
// matched into a new squad. Returns how many squads were expired.
async function expireStaleSquads() {
  const staleResult = await pool.query(
    `SELECT id FROM squads
     WHERE status = 'suggested'
       AND created_at < NOW() - ($1 || ' hours')::interval`,
    [SQUAD_EXPIRY_HOURS]
  );

  const staleSquadIds = staleResult.rows.map(r => r.id);
  if (staleSquadIds.length === 0) {
    return 0;
  }

  const memberResult = await pool.query(
    `SELECT student_id FROM squad_members WHERE squad_id = ANY($1::int[])`,
    [staleSquadIds]
  );
  const studentIds = memberResult.rows.map(r => r.student_id);

  await pool.query(
    `DELETE FROM squad_members WHERE squad_id = ANY($1::int[])`,
    [staleSquadIds]
  );

  await pool.query(
    `UPDATE squads SET status = 'expired' WHERE id = ANY($1::int[])`,
    [staleSquadIds]
  );

  if (studentIds.length > 0) {
    await pool.query(
      `UPDATE students SET matching_status = 'not_started' WHERE id = ANY($1::int[])`,
      [studentIds]
    );
  }

  console.log(`Expired ${staleSquadIds.length} stale squad(s), freed ${studentIds.length} student(s) to re-match.`);
  return staleSquadIds.length;
}

// Replaces the old "4 manual confirms -> lock" flow. There is no confirm
// step anymore -- every member is inserted already 'confirmed'. A squad
// becomes active (status='locked', Squad Notes unlocks) automatically the
// moment its member count reaches 4, whether that 4th member arrived via
// matching or an invite link. Safe to call any time; no-ops if already
// active or still under 4.
async function activateSquadIfReady(squadId) {
  const squadResult = await pool.query('SELECT status FROM squads WHERE id = $1', [squadId]);
  if (squadResult.rows.length === 0 || squadResult.rows[0].status === 'locked') {
    return false;
  }

  const countResult = await pool.query(
    'SELECT COUNT(*) FROM squad_members WHERE squad_id = $1',
    [squadId]
  );
  const memberCount = parseInt(countResult.rows[0].count, 10);

  if (memberCount < 4) {
    return false;
  }

  await pool.query(`UPDATE squads SET status = 'locked' WHERE id = $1`, [squadId]);
  await pool.query(
    `UPDATE students SET matching_status = 'confirmed'
     WHERE id IN (SELECT student_id FROM squad_members WHERE squad_id = $1)`,
    [squadId]
  );
  return true;
}

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
    const { name, email, password, institution, year, academic_group, aspirant_type, inviteCode } = req.body;

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
       RETURNING id, name, email, institution, year, academic_group, aspirant_type, matching_status, created_at`,
      [name, email, passwordHash, institution, year, academic_group, aspirant_type]
    );

    const newStudent = result.rows[0];

    // If an invite code was provided, try to auto-join the squad
    if (inviteCode) {
      const squadResult = await pool.query('SELECT * FROM squads WHERE invite_code = $1', [inviteCode]);

      if (squadResult.rows.length > 0) {
        const squad = squadResult.rows[0];

        const membersResult = await pool.query(
          'SELECT slot FROM squad_members WHERE squad_id = $1 ORDER BY slot',
          [squad.id]
        );
        const takenSlots = membersResult.rows.map(r => r.slot);

        let nextSlot = null;
        if (takenSlots.length < 6) {
          nextSlot = 1;
          while (takenSlots.includes(nextSlot)) nextSlot++;
        }

        if (nextSlot !== null) {
          await pool.query(
            `INSERT INTO squad_members (squad_id, student_id, slot, join_type, status)
             VALUES ($1, $2, $3, 'invite', 'confirmed')`,
            [squad.id, newStudent.id, nextSlot]
          );

          await pool.query(
            `UPDATE students SET matching_status = 'suggested' WHERE id = $1`,
            [newStudent.id]
          );

          await activateSquadIfReady(squad.id);

          newStudent.matching_status = 'suggested';
          newStudent.joinedSquad = squad.id;
        }
      }
    }

    res.status(201).json(newStudent);

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
       RETURNING id, name, email, institution, created_at`,
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

app.patch('/mentors/:mentorId/groups/:groupName/approve', async (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  const { mentorId, groupName } = req.params;

  try {
    const result = await pool.query(
      `UPDATE mentor_groups SET approval_status = 'approved'
       WHERE mentor_id = $1 AND group_name = $2
       RETURNING mentor_id, group_name, approval_status`,
      [mentorId, groupName]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mentor group request not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong approving the group.' });
  }
});

app.post('/mentors/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const result = await pool.query('SELECT * FROM mentors WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const mentor = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, mentor.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { mentorId: mentor.id, email: mentor.email, role: 'mentor' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      mentor: {
        id: mentor.id,
        name: mentor.name,
        email: mentor.email,
        institution: mentor.institution,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong logging in.' });
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


// ---- Mentor-fee subscription payments ----
// A student must have one row here with status = 'approved' before they
// can run matching (see the payment gate in POST /students/:id/match).
// Submission is self-reported (phone + Trx ID) and reviewed by an admin.

const PAYMENT_PLANS = {
  '1_month': 99,
  '6_month': 499,
};
const PAYMENT_METHODS = ['nagad', 'bkash'];

app.post('/students/:id/payments', requireAuth, async (req, res) => {
  const studentId = parseInt(req.params.id);

  if (studentId !== req.student.studentId) {
    return res.status(403).json({ error: 'You can only submit a payment for your own account.' });
  }

  const { plan, method, sender_phone, trx_id } = req.body;

  if (!PAYMENT_PLANS[plan]) {
    return res.status(400).json({ error: 'plan must be 1_month or 6_month.' });
  }
  if (!PAYMENT_METHODS.includes(method)) {
    return res.status(400).json({ error: 'method must be nagad or bkash.' });
  }
  if (!sender_phone || !trx_id) {
    return res.status(400).json({ error: 'sender_phone and trx_id are required.' });
  }

  try {
    // Don't let a student stack up duplicate pending submissions -- if one
    // is already awaiting review, point them at it instead of creating a
    // second one that would confuse the admin queue.
    const existingPending = await pool.query(
      `SELECT id FROM payments WHERE student_id = $1 AND status = 'pending'`,
      [studentId]
    );
    if (existingPending.rows.length > 0) {
      return res.status(400).json({
        error: 'You already have a payment awaiting review.',
        paymentId: existingPending.rows[0].id,
      });
    }

    const amount = PAYMENT_PLANS[plan];
    const result = await pool.query(
      `INSERT INTO payments (student_id, plan, amount, method, sender_phone, trx_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [studentId, plan, amount, method, sender_phone, trx_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong submitting your payment.' });
  }
});

// The student's own latest payment -- lets the frontend show "awaiting
// admin approval" / "approved" / "rejected, try again" without needing
// admin access.
app.get('/students/:id/payments/latest', requireAuth, async (req, res) => {
  const studentId = parseInt(req.params.id);

  if (studentId !== req.student.studentId) {
    return res.status(403).json({ error: 'You can only view your own payment status.' });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM payments WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [studentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No payment submitted yet.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading your payment status.' });
  }
});

app.get('/admin/payments', async (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  const statusFilter = req.query.status; // optional: pending | approved | rejected

  try {
    const params = [];
    let where = '';
    if (statusFilter) {
      params.push(statusFilter);
      where = `WHERE p.status = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT p.*, s.name AS student_name, s.email AS student_email
       FROM payments p
       JOIN students s ON s.id = p.student_id
       ${where}
       ORDER BY p.created_at DESC`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading payments.' });
  }
});

app.patch('/admin/payments/:paymentId/approve', async (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  try {
    const result = await pool.query(
      `UPDATE payments SET status = 'approved', reviewed_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [req.params.paymentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pending payment not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong approving this payment.' });
  }
});

app.patch('/admin/payments/:paymentId/reject', async (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  try {
    const result = await pool.query(
      `UPDATE payments SET status = 'rejected', reviewed_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [req.params.paymentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pending payment not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong rejecting this payment.' });
  }
});


app.post('/students/:id/match', requireAuth, async (req, res) => {
  const studentId = parseInt(req.params.id);

  if (studentId !== req.student.studentId) {
    return res.status(403).json({ error: 'You can only run matching for your own account.' });
  }

  try {
    // Task 37: clear out any squads that have been stuck at 'suggested'
    // for too long, so nobody is blocked by a dead squad.
    await expireStaleSquads();

    const studentResult = await pool.query(
      'SELECT id, year, academic_group, aspirant_type, matching_status FROM students WHERE id = $1',
      [studentId]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    const student = studentResult.rows[0];

    if (student.matching_status !== 'not_started') {
      return res.status(400).json({ error: 'You are already matched or in progress. Cannot start new matching.' });
    }

    // Mentor-fee subscription gate: matching requires an admin-approved
    // payment on file. See POST /students/:id/payments and the
    // /admin/payments review endpoints.
    const paymentCheck = await pool.query(
      `SELECT id FROM payments WHERE student_id = $1 AND status = 'approved'
       ORDER BY created_at DESC LIMIT 1`,
      [studentId]
    );
    if (paymentCheck.rows.length === 0) {
      return res.status(402).json({
        error: 'A confirmed mentor-fee payment is required before matching. Submit a payment and wait for admin approval.',
      });
    }

    // Prefer joining an existing open squad in the same year, academic
    // group, and aspirant type over always creating a brand new one --
    // this is what lets squads fill up one applicant at a time (there is
    // no manual "confirm" step anymore; everyone who joins is immediately
    // an active member).
    const openSquadResult = await pool.query(
      `SELECT sq.id
       FROM squads sq
       LEFT JOIN squad_members sm ON sm.squad_id = sq.id
       WHERE sq.year = $1 AND sq.academic_group = $2 AND sq.aspirant_type = $3
         AND sq.status != 'expired'
       GROUP BY sq.id, sq.created_at
       HAVING COUNT(sm.id) < 6
       ORDER BY COUNT(sm.id) DESC, sq.created_at ASC
       LIMIT 1`,
      [student.year, student.academic_group, student.aspirant_type]
    );

    let squad;
    let members;

    if (openSquadResult.rows.length > 0) {
      const squadId = openSquadResult.rows[0].id;

      const slotResult = await pool.query(
        `SELECT slot FROM squad_members WHERE squad_id = $1 ORDER BY slot`,
        [squadId]
      );
      const takenSlots = slotResult.rows.map((r) => r.slot);
      let nextSlot = 1;
      while (takenSlots.includes(nextSlot)) nextSlot++;

      // Contribute this student's strong subjects (proficiency >= 4) that
      // aren't already covered by an existing member, so they add real
      // value to the squad rather than duplicating existing coverage.
      const strongSubjectsResult = await pool.query(
        `SELECT subject_id FROM student_subjects WHERE student_id = $1 AND proficiency >= 4`,
        [studentId]
      );
      const alreadyCoveredResult = await pool.query(
        `SELECT DISTINCT subject_id FROM squad_subject_coverage WHERE squad_id = $1`,
        [squadId]
      );
      const alreadyCovered = new Set(alreadyCoveredResult.rows.map((r) => r.subject_id));
      const contributes = strongSubjectsResult.rows
        .map((r) => r.subject_id)
        .filter((id) => !alreadyCovered.has(id));

      await pool.query(
        `INSERT INTO squad_members (squad_id, student_id, slot, join_type, status)
         VALUES ($1, $2, $3, 'auto', 'confirmed')`,
        [squadId, studentId, nextSlot]
      );

      for (const subjectId of contributes) {
        await pool.query(
          `INSERT INTO squad_subject_coverage (squad_id, student_id, subject_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (squad_id, student_id, subject_id) DO NOTHING`,
          [squadId, studentId, subjectId]
        );
      }

      await pool.query(`UPDATE students SET matching_status = 'suggested' WHERE id = $1`, [studentId]);
      await activateSquadIfReady(squadId);

      const finalSquadResult = await pool.query('SELECT * FROM squads WHERE id = $1', [squadId]);
      squad = finalSquadResult.rows[0];

      const membersResult = await pool.query(
        `SELECT sm.slot, sm.student_id, s.name, sm.join_type, sm.status
         FROM squad_members sm
         JOIN students s ON s.id = sm.student_id
         WHERE sm.squad_id = $1
         ORDER BY sm.slot`,
        [squadId]
      );
      members = membersResult.rows;
    } else {
      // No open squad exists yet -- try to form a brand new one from
      // everyone currently eligible and waiting.
      const matchedStudents = await findAutoSquad(pool, {
        year: student.year,
        academic_group: student.academic_group,
        aspirant_type: student.aspirant_type,
        requestingStudentId: studentId,
      });

      if (matchedStudents.length === 0) {
        return res.status(404).json({ error: 'No eligible students found to form a squad right now. Try again later.' });
      }

      const squadResult = await pool.query(
        `INSERT INTO squads (academic_group, year, aspirant_type, status)
         VALUES ($1, $2, $3, 'suggested')
         RETURNING *`,
        [student.academic_group, student.year, student.aspirant_type]
      );
      squad = squadResult.rows[0];

      members = [];
      let slot = 1;
      for (const m of matchedStudents) {
        const memberResult = await pool.query(
          `INSERT INTO squad_members (squad_id, student_id, slot, join_type, status)
           VALUES ($1, $2, $3, 'auto', 'confirmed')
           RETURNING *`,
          [squad.id, m.student_id, slot]
        );

        members.push({ ...memberResult.rows[0], name: m.name, contributes: m.contributes });
        slot++;

        await pool.query(
          `UPDATE students SET matching_status = 'suggested' WHERE id = $1`,
          [m.student_id]
        );

        for (const subjectId of m.contributes) {
          await pool.query(
            `INSERT INTO squad_subject_coverage (squad_id, student_id, subject_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (squad_id, student_id, subject_id) DO NOTHING`,
            [squad.id, m.student_id, subjectId]
          );
        }
      }

      const becameActive = await activateSquadIfReady(squad.id);
      if (becameActive) {
        const refreshed = await pool.query('SELECT * FROM squads WHERE id = $1', [squad.id]);
        squad = refreshed.rows[0];
      }
    }

    res.status(201).json({ squad, members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong running matching.' });
  }
});


app.post('/squads/:squadId/invite', requireAuth, async (req, res) => {
  const squadId = parseInt(req.params.squadId);
  const studentId = req.student.studentId;

  try {
    const memberCheck = await pool.query(
      `SELECT status FROM squad_members WHERE squad_id = $1 AND student_id = $2`,
      [squadId, studentId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this squad.' });
    }

    if (memberCheck.rows[0].status !== 'confirmed') {
      return res.status(403).json({ error: 'Only confirmed members can generate an invite link.' });
    }

    const squadResult = await pool.query('SELECT invite_code FROM squads WHERE id = $1', [squadId]);
    let inviteCode = squadResult.rows[0].invite_code;

    if (!inviteCode) {
      inviteCode = Math.random().toString(36).substring(2, 10);
      await pool.query('UPDATE squads SET invite_code = $1 WHERE id = $2', [inviteCode, squadId]);
    }

    res.json({ inviteCode, inviteLink: `yourapp.com/join/${inviteCode}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong generating the invite link.' });
  }
});


app.post('/invites/:inviteCode/join', requireAuth, async (req, res) => {
  const inviteCode = req.params.inviteCode;
  const studentId = req.student.studentId;

  try {
    const squadResult = await pool.query('SELECT * FROM squads WHERE invite_code = $1', [inviteCode]);

    if (squadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired invite link.' });
    }

    const squad = squadResult.rows[0];

    const alreadyInSquad = await pool.query(
      'SELECT id FROM squad_members WHERE student_id = $1',
      [studentId]
    );
    if (alreadyInSquad.rows.length > 0) {
      return res.status(400).json({ error: 'You are already in a squad.' });
    }

    const membersResult = await pool.query(
      'SELECT slot FROM squad_members WHERE squad_id = $1 ORDER BY slot',
      [squad.id]
    );
    const takenSlots = membersResult.rows.map(r => r.slot);

    if (takenSlots.length >= 6) {
      return res.status(400).json({ error: 'This squad is already full. Invite link has been used up.' });
    }

    // Squads now fill up incrementally (no fixed "first 4 via matching,
    // last 2 via invite" split), so an invite can land in any open slot,
    // not just 5-6.
    let nextSlot = 1;
    while (takenSlots.includes(nextSlot)) nextSlot++;

    const insertResult = await pool.query(
      `INSERT INTO squad_members (squad_id, student_id, slot, join_type, status)
       VALUES ($1, $2, $3, 'invite', 'confirmed')
       RETURNING *`,
      [squad.id, studentId, nextSlot]
    );

    await pool.query(
      `UPDATE students SET matching_status = 'suggested' WHERE id = $1`,
      [studentId]
    );

    await activateSquadIfReady(squad.id);
    const finalSquadResult = await pool.query('SELECT * FROM squads WHERE id = $1', [squad.id]);

    res.status(201).json({ squad: finalSquadResult.rows[0], member: insertResult.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong joining the squad.' });
  }
});


// How many of a student's High-priority-to-improve subjects are covered
// by *other* members of a given squad. Used to compare "is this candidate
// squad a better fit than my current one" for the suggested-squad check
// below. A simple, honest heuristic -- not a sophisticated recommender --
// but it directly reflects what the student said they most want help with.
async function highPriorityCoverageScore(squadId, studentId) {
  const highPriorityResult = await pool.query(
    `SELECT subject_id FROM student_subjects WHERE student_id = $1 AND improvement_priority = 'High'`,
    [studentId]
  );
  const highPriorityIds = highPriorityResult.rows.map((r) => r.subject_id);
  if (highPriorityIds.length === 0) return 0;

  const coverageResult = await pool.query(
    `SELECT DISTINCT subject_id FROM squad_subject_coverage
     WHERE squad_id = $1 AND student_id != $2 AND subject_id = ANY($3::int[])`,
    [squadId, studentId, highPriorityIds]
  );
  return coverageResult.rows.length;
}

// Checks whether a better-fitting squad currently exists for this student
// than the one they're already in. "Better" = strictly more of their
// High-priority subjects are covered by teammates. Purely informational --
// switching is the student's choice via POST .../switch-squad.
app.get('/students/:id/suggested-squad', requireAuth, async (req, res) => {
  const studentId = parseInt(req.params.id);

  if (studentId !== req.student.studentId) {
    return res.status(403).json({ error: 'You can only view suggestions for your own account.' });
  }

  try {
    const memberResult = await pool.query(
      `SELECT sm.squad_id, sq.year, sq.academic_group, sq.aspirant_type
       FROM squad_members sm
       JOIN squads sq ON sq.id = sm.squad_id
       WHERE sm.student_id = $1`,
      [studentId]
    );

    if (memberResult.rows.length === 0) {
      return res.json({ suggestion: null });
    }

    const current = memberResult.rows[0];
    const currentScore = await highPriorityCoverageScore(current.squad_id, studentId);

    const candidatesResult = await pool.query(
      `SELECT sq.id
       FROM squads sq
       LEFT JOIN squad_members sm ON sm.squad_id = sq.id
       WHERE sq.year = $1 AND sq.academic_group = $2 AND sq.aspirant_type = $3
         AND sq.id != $4 AND sq.status != 'expired'
       GROUP BY sq.id
       HAVING COUNT(sm.id) < 6`,
      [current.year, current.academic_group, current.aspirant_type, current.squad_id]
    );

    let best = null;
    for (const row of candidatesResult.rows) {
      const score = await highPriorityCoverageScore(row.id, studentId);
      if (score > currentScore && (!best || score > best.score)) {
        best = { squadId: row.id, score };
      }
    }

    if (!best) {
      return res.json({ suggestion: null });
    }

    res.json({
      suggestion: {
        squadId: best.squadId,
        currentCoverage: currentScore,
        suggestedCoverage: best.score,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong checking for a better squad match.' });
  }
});

// Moves a student from their current squad into a better-fitting one they
// were shown via GET .../suggested-squad. Entirely opt-in.
app.post('/students/:id/switch-squad', requireAuth, async (req, res) => {
  const studentId = parseInt(req.params.id);

  if (studentId !== req.student.studentId) {
    return res.status(403).json({ error: 'You can only switch your own squad.' });
  }

  const { targetSquadId } = req.body;
  if (!targetSquadId) {
    return res.status(400).json({ error: 'targetSquadId is required.' });
  }

  try {
    const currentResult = await pool.query(
      `SELECT squad_id FROM squad_members WHERE student_id = $1`,
      [studentId]
    );
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'You are not currently in a squad.' });
    }
    const oldSquadId = currentResult.rows[0].squad_id;

    if (oldSquadId === targetSquadId) {
      return res.status(400).json({ error: 'You are already in this squad.' });
    }

    const targetSlotsResult = await pool.query(
      `SELECT slot FROM squad_members WHERE squad_id = $1 ORDER BY slot`,
      [targetSquadId]
    );
    const taken = targetSlotsResult.rows.map((r) => r.slot);
    if (taken.length >= 6) {
      return res.status(400).json({ error: 'That squad is already full.' });
    }
    let nextSlot = 1;
    while (taken.includes(nextSlot)) nextSlot++;

    await pool.query(
      `DELETE FROM squad_members WHERE squad_id = $1 AND student_id = $2`,
      [oldSquadId, studentId]
    );
    await pool.query(
      `DELETE FROM squad_subject_coverage WHERE squad_id = $1 AND student_id = $2`,
      [oldSquadId, studentId]
    );

    await pool.query(
      `INSERT INTO squad_members (squad_id, student_id, slot, join_type, status)
       VALUES ($1, $2, $3, 'auto', 'confirmed')`,
      [targetSquadId, studentId, nextSlot]
    );

    const strongSubjectsResult = await pool.query(
      `SELECT subject_id FROM student_subjects WHERE student_id = $1 AND proficiency >= 4`,
      [studentId]
    );
    const alreadyCoveredResult = await pool.query(
      `SELECT DISTINCT subject_id FROM squad_subject_coverage WHERE squad_id = $1`,
      [targetSquadId]
    );
    const alreadyCovered = new Set(alreadyCoveredResult.rows.map((r) => r.subject_id));
    const contributes = strongSubjectsResult.rows
      .map((r) => r.subject_id)
      .filter((id) => !alreadyCovered.has(id));

    for (const subjectId of contributes) {
      await pool.query(
        `INSERT INTO squad_subject_coverage (squad_id, student_id, subject_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (squad_id, student_id, subject_id) DO NOTHING`,
        [targetSquadId, studentId, subjectId]
      );
    }

    await activateSquadIfReady(targetSquadId);

    const finalSquad = await pool.query('SELECT * FROM squads WHERE id = $1', [targetSquadId]);
    res.json({ squad: finalSquad.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong switching squads.' });
  }
});


app.get('/mentors/available-squads', requireAuth, async (req, res) => {
  const mentorId = req.mentor?.mentorId;

  if (!mentorId) {
    return res.status(403).json({ error: 'Only mentors can view available squads.' });
  }

  try {
    const approvedGroupsResult = await pool.query(
      `SELECT group_name FROM mentor_groups WHERE mentor_id = $1 AND approval_status = 'approved'`,
      [mentorId]
    );

    const approvedGroups = approvedGroupsResult.rows.map(r => r.group_name);

    if (approvedGroups.length === 0) {
      return res.json([]);
    }

    const squadsResult = await pool.query(
      `SELECT * FROM squads
       WHERE status = 'locked' AND mentor_id IS NULL
       AND academic_group = ANY($1::text[])`,
      [approvedGroups]
    );

    res.json(squadsResult.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching available squads.' });
  }
});


app.post('/squads/:squadId/assign-mentor', requireAuth, async (req, res) => {
  const squadId = parseInt(req.params.squadId);
  const mentorId = req.mentor?.mentorId;

  if (!mentorId) {
    return res.status(403).json({ error: 'Only mentors can be assigned to squads.' });
  }

  try {
    const squadResult = await pool.query('SELECT * FROM squads WHERE id = $1', [squadId]);

    if (squadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Squad not found.' });
    }

    const squad = squadResult.rows[0];

    if (squad.status !== 'locked') {
      return res.status(400).json({ error: 'This squad is not yet locked and cannot be assigned a mentor.' });
    }

    if (squad.mentor_id !== null) {
      return res.status(400).json({ error: 'This squad already has a mentor assigned.' });
    }

    const groupCheck = await pool.query(
      `SELECT approval_status FROM mentor_groups WHERE mentor_id = $1 AND group_name = $2`,
      [mentorId, squad.academic_group]
    );

    if (groupCheck.rows.length === 0 || groupCheck.rows[0].approval_status !== 'approved') {
      return res.status(403).json({ error: 'You are not approved to mentor this group.' });
    }

    const updateResult = await pool.query(
      `UPDATE squads SET mentor_id = $1 WHERE id = $2 AND mentor_id IS NULL RETURNING *`,
      [mentorId, squadId]
    );

    if (updateResult.rows.length === 0) {
      return res.status(409).json({ error: 'This squad was just claimed by another mentor.' });
    }

    res.json(updateResult.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong assigning you to this squad.' });
  }
});


app.patch('/squads/:squadId/reassign-mentor', async (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  const squadId = parseInt(req.params.squadId);
  const { mentorId } = req.body; // pass null to clear the mentor

  try {
    const squadResult = await pool.query('SELECT * FROM squads WHERE id = $1', [squadId]);

    if (squadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Squad not found.' });
    }

    const squad = squadResult.rows[0];

    if (mentorId !== null && mentorId !== undefined) {
      const groupCheck = await pool.query(
        `SELECT approval_status FROM mentor_groups WHERE mentor_id = $1 AND group_name = $2`,
        [mentorId, squad.academic_group]
      );

      if (groupCheck.rows.length === 0 || groupCheck.rows[0].approval_status !== 'approved') {
        return res.status(400).json({ error: 'That mentor is not approved to mentor this squad\'s group.' });
      }
    }

    const updateResult = await pool.query(
      `UPDATE squads SET mentor_id = $1 WHERE id = $2 RETURNING *`,
      [mentorId ?? null, squadId]
    );

    res.json(updateResult.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong reassigning the mentor.' });
  }
});


app.post('/squads/:squadId/messages', requireAuth, async (req, res) => {
  const squadId = parseInt(req.params.squadId);
  const { message } = req.body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message text is required.' });
  }

  try {
    const squadResult = await pool.query('SELECT * FROM squads WHERE id = $1', [squadId]);

    if (squadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Squad not found.' });
    }

    const squad = squadResult.rows[0];

    if (squad.status !== 'locked') {
      return res.status(400).json({ error: 'This squad is not locked yet. Chat is not available.' });
    }

    let senderType = null;
    let senderId = null;

    if (req.mentor?.mentorId && req.mentor.mentorId === squad.mentor_id) {
      senderType = 'mentor';
      senderId = req.mentor.mentorId;
    } else if (req.student?.studentId) {
      const memberCheck = await pool.query(
        `SELECT status FROM squad_members WHERE squad_id = $1 AND student_id = $2`,
        [squadId, req.student.studentId]
      );

      if (memberCheck.rows.length > 0 && memberCheck.rows[0].status === 'confirmed') {
        senderType = 'student';
        senderId = req.student.studentId;
      }
    }

    if (!senderType) {
      return res.status(403).json({ error: 'You are not authorized to send messages in this squad.' });
    }

    const insertResult = await pool.query(
      `INSERT INTO squad_messages (squad_id, sender_type, sender_id, message)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [squadId, senderType, senderId, message.trim()]
    );

    res.status(201).json(insertResult.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong sending the message.' });
  }
});


app.get('/squads/:squadId/messages', requireAuth, async (req, res) => {
  const squadId = parseInt(req.params.squadId);

  try {
    const squadResult = await pool.query('SELECT * FROM squads WHERE id = $1', [squadId]);

    if (squadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Squad not found.' });
    }

    const squad = squadResult.rows[0];

    let isAuthorized = false;

    if (req.mentor?.mentorId && req.mentor.mentorId === squad.mentor_id) {
      isAuthorized = true;
    } else if (req.student?.studentId) {
      const memberCheck = await pool.query(
        `SELECT status FROM squad_members WHERE squad_id = $1 AND student_id = $2`,
        [squadId, req.student.studentId]
      );

      if (memberCheck.rows.length > 0 && memberCheck.rows[0].status === 'confirmed') {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: 'You are not authorized to view messages in this squad.' });
    }

    const messagesResult = await pool.query(
      `SELECT
         sm.id, sm.sender_type, sm.sender_id, sm.message, sm.created_at,
         CASE
           WHEN sm.sender_type = 'student' THEN (SELECT name FROM students WHERE id = sm.sender_id)
           WHEN sm.sender_type = 'mentor' THEN (SELECT name FROM mentors WHERE id = sm.sender_id)
         END AS sender_name
       FROM squad_messages sm
       WHERE sm.squad_id = $1
       ORDER BY sm.created_at ASC`,
      [squadId]
    );

    res.json(messagesResult.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching messages.' });
  }
});


app.get('/students/:id/squad', requireAuth, async (req, res) => {
  const studentId = parseInt(req.params.id);

  if (studentId !== req.student.studentId) {
    return res.status(403).json({ error: 'You can only view your own squad.' });
  }

  try {
    const memberResult = await pool.query(
      `SELECT squad_id, slot, join_type, status FROM squad_members WHERE student_id = $1`,
      [studentId]
    );

    if (memberResult.rows.length === 0) {
      return res.status(404).json({ error: 'You are not currently in a squad.' });
    }

    const myMembership = memberResult.rows[0];
    const squadId = myMembership.squad_id;

    const squadResult = await pool.query('SELECT * FROM squads WHERE id = $1', [squadId]);
    const squad = squadResult.rows[0];

    const membersResult = await pool.query(
      `SELECT sm.slot, sm.student_id, s.name, sm.join_type, sm.status
       FROM squad_members sm
       JOIN students s ON s.id = sm.student_id
       WHERE sm.squad_id = $1
       ORDER BY sm.slot`,
      [squadId]
    );

    let mentor = null;
    if (squad.mentor_id) {
      const mentorResult = await pool.query(
        `SELECT id, name, email, institution FROM mentors WHERE id = $1`,
        [squad.mentor_id]
      );
      mentor = mentorResult.rows[0] || null;
    }

    const coverageByStudent = await getSubjectCoverage(squadId);

    res.json({
      squad,
      myStatus: myMembership.status,
      members: attachCoverage(membersResult.rows, coverageByStudent),
      mentor
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching your squad.' });
  }
});


app.get('/mentors/my-squads', requireAuth, async (req, res) => {
  const mentorId = req.mentor?.mentorId;

  if (!mentorId) {
    return res.status(403).json({ error: 'Only mentors can view their assigned squads.' });
  }

  try {
    const squadsResult = await pool.query(
      `SELECT * FROM squads WHERE mentor_id = $1 ORDER BY created_at DESC`,
      [mentorId]
    );

    const squads = squadsResult.rows;

    for (const squad of squads) {
      const membersResult = await pool.query(
        `SELECT sm.slot, sm.student_id, s.name, sm.join_type, sm.status
         FROM squad_members sm
         JOIN students s ON s.id = sm.student_id
         WHERE sm.squad_id = $1
         ORDER BY sm.slot`,
        [squad.id]
      );
      const coverageByStudent = await getSubjectCoverage(squad.id);
      squad.members = attachCoverage(membersResult.rows, coverageByStudent);
    }

    res.json(squads);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching your squads.' });
  }
});


app.get('/squads/:squadId', requireAuth, async (req, res) => {
  const squadId = parseInt(req.params.squadId);

  try {
    const squadResult = await pool.query('SELECT * FROM squads WHERE id = $1', [squadId]);

    if (squadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Squad not found.' });
    }

    const squad = squadResult.rows[0];

    let isAuthorized = false;

    if (req.mentor?.mentorId && req.mentor.mentorId === squad.mentor_id) {
      isAuthorized = true;
    } else if (req.student?.studentId) {
      const memberCheck = await pool.query(
        `SELECT status FROM squad_members WHERE squad_id = $1 AND student_id = $2`,
        [squadId, req.student.studentId]
      );

      if (memberCheck.rows.length > 0) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: 'You are not authorized to view this squad.' });
    }

    const membersResult = await pool.query(
      `SELECT sm.slot, sm.student_id, s.name, sm.join_type, sm.status
       FROM squad_members sm
       JOIN students s ON s.id = sm.student_id
       WHERE sm.squad_id = $1
       ORDER BY sm.slot`,
      [squadId]
    );

    let mentor = null;
    if (squad.mentor_id) {
      const mentorResult = await pool.query(
        `SELECT id, name, email, institution FROM mentors WHERE id = $1`,
        [squad.mentor_id]
      );
      mentor = mentorResult.rows[0] || null;
    }

    const coverageByStudent = await getSubjectCoverage(squadId);

    res.json({ squad, members: attachCoverage(membersResult.rows, coverageByStudent), mentor });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching squad details.' });
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

app.post('/admin/expire-stale-squads', async (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  try {
    const expiredCount = await expireStaleSquads();
    res.json({ expiredCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong expiring stale squads.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);

  // Task 37: also sweep automatically once an hour, so squads don't
  // rely on someone happening to run /match to get cleaned up.
  setInterval(() => {
    expireStaleSquads().catch(err => console.error('Scheduled squad expiry failed:', err));
  }, 60 * 60 * 1000);
});