/**
 * Types mirroring the real backend response shapes exactly
 * (verified against backend/server.js — not guessed).
 */

export type AcademicGroup = "Science" | "Arts" | "Commerce";
export type ImprovementPriority = "Low" | "Medium" | "High";
export type MatchingStatus = "not_started" | "suggested" | "confirmed";
export type SquadStatus = "suggested" | "locked";
export type MemberStatus = "pending" | "confirmed";
export type JoinType = "auto" | "invite";
export type SenderType = "student" | "mentor";

// ---- Students ----

export interface Student {
  id: number;
  name: string;
  email: string;
  institution: string | null;
  year: string | null;
  academic_group: AcademicGroup | null;
  aspirant_type: string | null;
  matching_status: MatchingStatus;
  created_at: string;
  /** Only present if signup included a valid inviteCode that had an open slot. */
  joinedSquad?: number;
}

/** The trimmed student object returned by POST /login. */
export interface StudentSession {
  id: number;
  name: string;
  email: string;
  academic_group: AcademicGroup | null;
}

// ---- Mentors ----

export interface Mentor {
  id: number;
  name: string;
  email: string;
  institution: string;
  created_at: string;
  groups: AcademicGroup[];
}

/** The trimmed mentor object returned by POST /mentors/login. */
export interface MentorSession {
  id: number;
  name: string;
  email: string;
  institution: string;
}

/** Public mentor info attached to a squad view (no auth fields). */
export interface MentorPublic {
  id: number;
  name: string;
  email: string;
  institution: string;
}

// ---- Subjects ----

export interface SubjectAssessmentInput {
  subject_id: number;
  proficiency: 1 | 2 | 3 | 4 | 5;
  improvement_priority: ImprovementPriority;
}

export interface SavedStudentSubject {
  id: number;
  student_id: number;
  subject_id: number;
  proficiency: number;
  improvement_priority: ImprovementPriority;
}

// ---- Squads ----

export interface Squad {
  id: number;
  academic_group: AcademicGroup;
  year: string;
  aspirant_type: string;
  status: SquadStatus;
  invite_code: string | null;
  mentor_id: number | null;
  created_at: string;
}

/** Member shape returned right after matching (POST /students/:id/match). */
export interface MatchedMember {
  id: number;
  squad_id: number;
  student_id: number;
  slot: number;
  join_type: JoinType;
  status: MemberStatus;
  joined_at: string;
  name: string;
  /** Subject IDs this student covers — not yet resolved to names. */
  contributes: number[];
}

export interface MatchResult {
  squad: Squad;
  members: MatchedMember[];
}

/** Plain roster member shape (no coverage) — used by /squads/:id/confirm. */
export interface RosterMember {
  slot: number;
  student_id: number;
  name: string;
  join_type: JoinType;
  status: MemberStatus;
}

export interface ConfirmResult {
  squad: Squad;
  members: RosterMember[];
}

/** Roster member with persisted Coverage Matrix data (Task 36). */
export interface CoverageMember extends RosterMember {
  /** Subject names this student covers in this squad. */
  covers: string[];
}

export interface StudentSquadView {
  squad: Squad;
  myStatus: MemberStatus;
  members: CoverageMember[];
  mentor: MentorPublic | null;
}

export interface SquadDetailView {
  squad: Squad;
  members: CoverageMember[];
  mentor: MentorPublic | null;
}

export interface MentorSquad extends Squad {
  members: CoverageMember[];
}

export interface InviteResult {
  inviteCode: string;
  inviteLink: string;
}

export interface JoinedMember {
  id: number;
  squad_id: number;
  student_id: number;
  slot: number;
  join_type: JoinType;
  status: MemberStatus;
  joined_at: string;
}

export interface JoinResult {
  squad: Squad;
  member: JoinedMember;
}

// ---- Chat ("Squad Notes") ----

export interface SquadMessage {
  id: number;
  sender_type: SenderType;
  sender_id: number;
  message: string;
  created_at: string;
  sender_name: string;
}

// ---- Errors ----

/** Shape of every error response body from this backend: { error: string } */
export interface ApiErrorBody {
  error: string;
}
