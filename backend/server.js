const express = require('express');
const pool = require('./db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const requireAuth = require('./middleware/auth');
const { findAutoSquad } = require('./utils/matching');
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
        for (let s = 5; s <= 6; s++) {
          if (!takenSlots.includes(s)) {
            nextSlot = s;
            break;
          }
        }

        if (nextSlot !== null) {
          await pool.query(
            `INSERT INTO squad_members (squad_id, student_id, slot, join_type, status)
             VALUES ($1, $2, $3, 'invite', 'pending')`,
            [squad.id, newStudent.id, nextSlot]
          );

          await pool.query(
            `UPDATE students SET matching_status = 'suggested' WHERE id = $1`,
            [newStudent.id]
          );

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


app.post('/students/:id/match', requireAuth, async (req, res) => {
  const studentId = parseInt(req.params.id);

  if (studentId !== req.student.studentId) {
    return res.status(403).json({ error: 'You can only run matching for your own account.' });
  }

  try {
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

    const matchedStudents = await findAutoSquad(pool, {
      year: student.year,
      academic_group: student.academic_group,
      aspirant_type: student.aspirant_type,
      requestingStudentId: studentId
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
    const squad = squadResult.rows[0];

    const members = [];
    let slot = 1;
    for (const m of matchedStudents) {
      const memberResult = await pool.query(
        `INSERT INTO squad_members (squad_id, student_id, slot, join_type, status)
         VALUES ($1, $2, $3, 'auto', 'pending')
         RETURNING *`,
        [squad.id, m.student_id, slot]
      );
      members.push({ ...memberResult.rows[0], name: m.name, contributes: m.contributes });
      slot++;

      await pool.query(
        `UPDATE students SET matching_status = 'suggested' WHERE id = $1`,
        [m.student_id]
      );
    }

    res.status(201).json({ squad, members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong running matching.' });
  }
});


app.post('/squads/:squadId/confirm', requireAuth, async (req, res) => {
  const squadId = parseInt(req.params.squadId);
  const studentId = req.student.studentId;

  try {
    const memberCheck = await pool.query(
      `SELECT * FROM squad_members WHERE squad_id = $1 AND student_id = $2`,
      [squadId, studentId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this squad.' });
    }

    await pool.query(
      `UPDATE squad_members SET status = 'confirmed' WHERE squad_id = $1 AND student_id = $2`,
      [squadId, studentId]
    );

    const confirmedResult = await pool.query(
      `SELECT student_id FROM squad_members WHERE squad_id = $1 AND status = 'confirmed'`,
      [squadId]
    );
    const confirmedCount = confirmedResult.rows.length;

    const squadResult = await pool.query('SELECT * FROM squads WHERE id = $1', [squadId]);
    let squad = squadResult.rows[0];

    if (confirmedCount >= 4 && squad.status !== 'locked') {
      const lockResult = await pool.query(
        `UPDATE squads SET status = 'locked' WHERE id = $1 RETURNING *`,
        [squadId]
      );
      squad = lockResult.rows[0];

      const confirmedIds = confirmedResult.rows.map(r => r.student_id);
      await pool.query(
        `UPDATE students SET matching_status = 'confirmed' WHERE id = ANY($1::int[])`,
        [confirmedIds]
      );
    }

    const membersResult = await pool.query(
      `SELECT sm.slot, sm.student_id, s.name, sm.join_type, sm.status
       FROM squad_members sm
       JOIN students s ON s.id = sm.student_id
       WHERE sm.squad_id = $1
       ORDER BY sm.slot`,
      [squadId]
    );

    res.json({ squad, members: membersResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong confirming your squad membership.' });
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

    let nextSlot = null;
    for (let s = 5; s <= 6; s++) {
      if (!takenSlots.includes(s)) {
        nextSlot = s;
        break;
      }
    }

    if (nextSlot === null) {
      return res.status(400).json({ error: 'No invite slots available for this squad.' });
    }

    const insertResult = await pool.query(
      `INSERT INTO squad_members (squad_id, student_id, slot, join_type, status)
       VALUES ($1, $2, $3, 'invite', 'pending')
       RETURNING *`,
      [squad.id, studentId, nextSlot]
    );

    await pool.query(
      `UPDATE students SET matching_status = 'suggested' WHERE id = $1`,
      [studentId]
    );

    res.status(201).json({ squad, member: insertResult.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong joining the squad.' });
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

    res.json({
      squad,
      myStatus: myMembership.status,
      members: membersResult.rows,
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
      squad.members = membersResult.rows;
    }

    res.json(squads);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching your squads.' });
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