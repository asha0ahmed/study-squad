-- Students table: stores each student's basic profile
CREATE TABLE students (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  institution VARCHAR(150),
  year VARCHAR(20),
  academic_group VARCHAR(50),
  aspirant_type VARCHAR(50),
  matching_status VARCHAR(20) DEFAULT 'not_started',
  squad_id INTEGER,
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