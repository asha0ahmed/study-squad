-- Students table: stores each student's basic profile
CREATE TABLE students (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  role VARCHAR(20) NOT NULL DEFAULT 'student',
  institution VARCHAR(150),
  year VARCHAR(20),
  academic_group VARCHAR(50),
  aspirant_type VARCHAR(50),
  matching_status VARCHAR(20) DEFAULT 'not_started',
  created_at TIMESTAMP DEFAULT NOW()
);


-- Subjects table: master list of subjects per academic group
CREATE TABLE subjects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  academic_group VARCHAR(50) NOT NULL
);

-- Student subjects: proficiency + improvement priority per student per subject
CREATE TABLE student_subjects (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
  proficiency INTEGER CHECK (proficiency BETWEEN 1 AND 5),
  improvement_priority VARCHAR(10) CHECK (improvement_priority IN ('Low', 'Medium', 'High')),
  UNIQUE(student_id, subject_id)
);


-- Starter subject data
INSERT INTO subjects (name, academic_group) VALUES
('Physics', 'Science'),
('Chemistry', 'Science'),
('Higher Math', 'Science'),
('Biology', 'Science'),
('English', 'Science'),
('ICT', 'Science'),
('History', 'Arts'),
('Economics', 'Arts'),
('English', 'Arts'),
('Civics', 'Arts'),
('Sociology', 'Arts'),
('Bangla', 'Arts');

CREATE TABLE mentors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  institution VARCHAR(150) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE mentor_groups (
  mentor_id INTEGER NOT NULL REFERENCES mentors(id),
  group_name VARCHAR(20) NOT NULL,
  approval_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  UNIQUE (mentor_id, group_name)
);

-- Task 32a: Squad matching tables

CREATE TABLE squads (
  id SERIAL PRIMARY KEY,
  academic_group VARCHAR(20) NOT NULL,
  year VARCHAR(30) NOT NULL,
  aspirant_type VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'suggested',
  invite_code VARCHAR(20) UNIQUE,
  mentor_id INTEGER REFERENCES mentors(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE squad_members (
  id SERIAL PRIMARY KEY,
  squad_id INTEGER NOT NULL REFERENCES squads(id),
  student_id INTEGER NOT NULL UNIQUE REFERENCES students(id),
  slot INTEGER NOT NULL,
  join_type VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (squad_id, slot)
);
   -- Note: students.squad_id was removed — squad membership is tracked
   -- exclusively via squad_members (student_id is UNIQUE there, enforcing
   -- one active squad per student). matching_status on students still
   -- tracks funnel state (not_started / suggested / confirmed).