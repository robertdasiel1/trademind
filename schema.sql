
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT DEFAULT 'user', -- 'admin' or 'user'
  is_active INTEGER DEFAULT 1, -- 1 = active, 0 = disabled
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- DEFAULT ADMIN USER
-- Username: admin
-- Password: Admin123!ChangeMe
-- Salt: static_salt_for_init (Normally random, static here for initialization)
-- Hash generated using PBKDF2-SHA256, 100k iterations.
INSERT INTO users (id, username, password_hash, salt, role, is_active)
VALUES (
  'admin-user-id', 
  'admin', 
  '4c91a0367253457a8710d0244795f32585292276535203360431306164227926', 
  'static_salt_for_init', 
  'admin', 
  1
);
