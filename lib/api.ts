/**
 * Study Squad API client.
 *
 * Single place that knows how to talk to the backend. Every screen should
 * import from here rather than calling `fetch` directly, so the base URL,
 * auth header, and error handling only exist once.
 *
 * Contract: this file must match backend/server.js exactly. Do not invent
 * endpoints or fields — if the frontend needs something the backend doesn't
 * provide, that's a signal to go back to the backend, not to guess here.
 */

import type {
  ApiErrorBody,
  ConfirmResult,
  InviteResult,
  JoinResult,
  MatchResult,
  Mentor,
  MentorSession,
  MentorSquad,
  SavedStudentSubject,
  Squad,
  SquadDetailView,
  SquadMessage,
  Student,
  StudentSession,
  StudentSquadView,
  SubjectAssessmentInput,
} from "./types";

// In dev this is the backend's local port. Overridable via env for later
// (staging/prod) without touching call sites.
const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

const TOKEN_KEY = "study-squad:token";
const SESSION_KEY = "study-squad:session"; // { role: 'student' | 'mentor', ...session }

export type SessionRole = "student" | "mentor";

export interface StoredSession {
  role: SessionRole;
  student?: StudentSession;
  mentor?: MentorSession;
}

/** Thrown for any non-2xx response. Carries the backend's `error` message. */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// ---- Token / session storage ----
// Plain localStorage, matching what the backend actually supports today
// (no refresh-token flow exists yet).

function isBrowser() {
  return typeof window !== "undefined";
}

export function getToken(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getSession(): StoredSession | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function setSession(token: string, session: StoredSession) {
  if (!isBrowser()) return;
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(SESSION_KEY);
}

// ---- Core request helper ----

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Set true for the one admin-only route that uses x-admin-secret instead of a JWT. */
  adminSecret?: string;
  /** Skip attaching the Authorization header (only needed pre-login). */
  skipAuth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!options.skipAuth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  if (options.adminSecret) {
    headers["x-admin-secret"] = options.adminSecret;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    // Network failure — backend unreachable, offline, CORS, etc.
    throw new ApiError(0, "Couldn't reach the server. Check your connection and try again.");
  }

  // Some routes (POST / and /db-test) return plain text; every real API
  // route we use returns JSON, including error bodies, so this is safe.
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const body = data as ApiErrorBody | null;
    throw new ApiError(response.status, body?.error ?? "Something went wrong.");
  }

  return data as T;
}

// ---- Auth & signup ----

export interface StudentSignupInput {
  name: string;
  email: string;
  password: string;
  institution: string;
  year: string;
  academic_group: "Science" | "Arts" | "Commerce";
  aspirant_type: string;
  /** Optional — joins a squad's open invite slot at signup time. */
  inviteCode?: string;
}

export function signupStudent(input: StudentSignupInput) {
  return request<Student>("/students", {
    method: "POST",
    body: input,
    skipAuth: true,
  });
}

export interface MentorSignupInput {
  name: string;
  email: string;
  password: string;
  institution: string;
  groups: ("Science" | "Arts" | "Commerce")[];
}

export function signupMentor(input: MentorSignupInput) {
  return request<Mentor>("/mentors", {
    method: "POST",
    body: input,
    skipAuth: true,
  });
}

export async function loginStudent(email: string, password: string) {
  const result = await request<{ token: string; student: StudentSession }>(
    "/login",
    { method: "POST", body: { email, password }, skipAuth: true },
  );
  setSession(result.token, { role: "student", student: result.student });
  return result;
}

export async function loginMentor(email: string, password: string) {
  const result = await request<{ token: string; mentor: MentorSession }>(
    "/mentors/login",
    { method: "POST", body: { email, password }, skipAuth: true },
  );
  setSession(result.token, { role: "mentor", mentor: result.mentor });
  return result;
}

export function logout() {
  clearSession();
}

// ---- Subjects / self-assessment (the "Profiler") ----

export function saveStudentSubjects(studentId: number, subjects: SubjectAssessmentInput[]) {
  return request<SavedStudentSubject[]>(`/students/${studentId}/subjects`, {
    method: "POST",
    body: { subjects },
  });
}

// ---- Matching & squad lifecycle ----

export function runMatch(studentId: number) {
  return request<MatchResult>(`/students/${studentId}/match`, { method: "POST" });
}

export function confirmSquadSlot(squadId: number) {
  return request<ConfirmResult>(`/squads/${squadId}/confirm`, { method: "POST" });
}

export function createInvite(squadId: number) {
  return request<InviteResult>(`/squads/${squadId}/invite`, { method: "POST" });
}

export function joinViaInvite(inviteCode: string) {
  return request<JoinResult>(`/invites/${inviteCode}/join`, { method: "POST" });
}

export function getMySquad(studentId: number) {
  return request<StudentSquadView>(`/students/${studentId}/squad`);
}

export function getSquad(squadId: number) {
  return request<SquadDetailView>(`/squads/${squadId}`);
}

// ---- Mentor-side ----

export function getAvailableSquads() {
  return request<Squad[]>("/mentors/available-squads");
}

export function assignMentorToSquad(squadId: number) {
  return request<Squad>(`/squads/${squadId}/assign-mentor`, { method: "POST" });
}

export function getMyMentorSquads() {
  return request<MentorSquad[]>("/mentors/my-squads");
}

// ---- Chat ("Squad Notes") ----

export function sendSquadMessage(squadId: number, message: string) {
  return request<SquadMessage>(`/squads/${squadId}/messages`, {
    method: "POST",
    body: { message },
  });
}

export function getSquadMessages(squadId: number) {
  return request<SquadMessage[]>(`/squads/${squadId}/messages`);
}
