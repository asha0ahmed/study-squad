// "mentor" per subject (the student strongest in that subject),
// prioritizing the hardest-to-cover subjects first.

async function findAutoSquad(pool, { year, academic_group, aspirant_type }) {
  // 1. Get eligible students (same filters, not yet in a squad)
  const studentsResult = await pool.query(
    `SELECT id, name FROM students
     WHERE year = $1 AND academic_group = $2 AND aspirant_type = $3
       AND matching_status = 'not_started'`,
    [year, academic_group, aspirant_type]
  );
  const eligibleStudents = studentsResult.rows;

  if (eligibleStudents.length === 0) {
    return [];
  }

  const studentIds = eligibleStudents.map(s => s.id);

  // 2. Get the subjects that belong to this academic group
  const subjectsResult = await pool.query(
    `SELECT id, name FROM subjects WHERE academic_group = $1`,
    [academic_group]
  );
  const subjects = subjectsResult.rows;

  // 3. Get proficiency ratings for these students in these subjects
  const proficiencyResult = await pool.query(
    `SELECT student_id, subject_id, proficiency
     FROM student_subjects
     WHERE student_id = ANY($1::int[])
       AND subject_id = ANY($2::int[])`,
    [studentIds, subjects.map(s => s.id)]
  );

  // Group proficiency by subject: subject_id -> [{student_id, proficiency}]
  const bySubject = {};
  for (const subj of subjects) {
    bySubject[subj.id] = [];
  }
  for (const row of proficiencyResult.rows) {
    bySubject[row.subject_id].push({
      student_id: row.student_id,
      proficiency: row.proficiency
    });
  }

  // Sort each subject's candidates strongest-first
  for (const subjId in bySubject) {
    bySubject[subjId].sort((a, b) => b.proficiency - a.proficiency);
  }

  // 4. Order subjects by scarcity: fewest strong (proficiency >= 4)
  //    candidates first, since those are hardest to cover
  const subjectOrder = subjects
    .map(s => {
      const strongCount = bySubject[s.id].filter(c => c.proficiency >= 4).length;
      return { subjectId: s.id, strongCount };
    })
    .sort((a, b) => a.strongCount - b.strongCount);

  // 5. Greedily assign one mentor per subject, scarcest subject first
  const selected = new Map(); // student_id -> student info
  const assignedStudentIds = new Set();

  for (const { subjectId } of subjectOrder) {
    if (selected.size >= 4) break;

    const candidates = bySubject[subjectId];
    const best = candidates.find(c => !assignedStudentIds.has(c.student_id));

    if (best) {
      assignedStudentIds.add(best.student_id);
      const student = eligibleStudents.find(s => s.id === best.student_id);
      selected.set(best.student_id, {
        student_id: best.student_id,
        name: student.name,
        contributes: [subjectId]
      });
    }
  }

  // 6. If fewer than 4 selected, fill remaining slots with the
  //    students who have the strongest overall combined proficiency
  if (selected.size < 4) {
    const totalScore = {};
    for (const s of eligibleStudents) {
      if (!assignedStudentIds.has(s.id)) {
        totalScore[s.id] = 0;
      }
    }
    for (const row of proficiencyResult.rows) {
      if (totalScore[row.student_id] !== undefined) {
        totalScore[row.student_id] += row.proficiency;
      }
    }
    const remaining = Object.entries(totalScore).sort((a, b) => b[1] - a[1]);

    for (const [studentId] of remaining) {
      if (selected.size >= 4) break;
      const student = eligibleStudents.find(s => s.id === Number(studentId));
      selected.set(Number(studentId), {
        student_id: Number(studentId),
        name: student.name,
        contributes: []
      });
    }
  }

  return Array.from(selected.values());
}

module.exports = { findAutoSquad };