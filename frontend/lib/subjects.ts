import type { AcademicGroup } from "./types";

/**
 * Subject master list, hardcoded to match the seed data in
 * backend/schema.sql exactly (there is no GET /subjects endpoint yet --
 * see API contract Section 4). IDs are inferred from insertion order into
 * a SERIAL primary key on a fresh database:
 *
 *   1 Physics (Science)      7  History (Arts)
 *   2 Chemistry (Science)    8  Economics (Arts)
 *   3 Higher Math (Science)  9  English (Arts)
 *   4 Biology (Science)      10 Civics (Arts)
 *   5 English (Science)      11 Sociology (Arts)
 *   6 ICT (Science)          12 Bangla (Arts)
 *
 * IMPORTANT: this assumes the subjects table was seeded exactly once, from
 * this exact schema.sql, on an empty database. If the real database's
 * subject IDs differ (re-seeded, reordered, or edited by hand), this map
 * will be wrong and student_subjects will save against the wrong subject.
 * Worth a quick manual check against the real DB (`SELECT * FROM subjects
 * ORDER BY id;`) before this goes live.
 */
export const SUBJECTS_BY_GROUP: Record<AcademicGroup, { id: number; name: string }[]> = {
  Science: [
    { id: 1, name: "Physics" },
    { id: 2, name: "Chemistry" },
    { id: 3, name: "Higher Math" },
    { id: 4, name: "Biology" },
    { id: 5, name: "English" },
    { id: 6, name: "ICT" },
  ],
  Arts: [
    { id: 7, name: "History" },
    { id: 8, name: "Economics" },
    { id: 9, name: "English" },
    { id: 10, name: "Civics" },
    { id: 11, name: "Sociology" },
    { id: 12, name: "Bangla" },
  ],
  // No Commerce subjects exist in schema.sql today.
  Commerce: [],
};
