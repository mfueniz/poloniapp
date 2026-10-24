-- poloniapp — schema MySQL/MariaDB (reemplaza supabase/schema.sql).
-- Lo corre automáticamente la API la primera vez (pantalla "crear primer admin" en /admin/),
-- o se puede importar a mano desde phpMyAdmin. Idempotente vía IF NOT EXISTS.
-- Cada sentencia termina en ";" al final de la línea: el instalador separa por ahí.

CREATE TABLE IF NOT EXISTS admins (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(191) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Textos fijos (hero, quiénes somos, contacto, etc.)
CREATE TABLE IF NOT EXISTS site_content (
  `key` VARCHAR(191) NOT NULL PRIMARY KEY,   -- ej. 'hero.title'
  section VARCHAR(191) NOT NULL,             -- agrupador para el panel admin
  value TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by CHAR(36) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
  id CHAR(36) NOT NULL PRIMARY KEY,
  slug VARCHAR(191) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  visible TINYINT(1) NOT NULL DEFAULT 1,
  bucket VARCHAR(20) NULL,                   -- null = fuera del esquema de chips (ej. Publicaciones)
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT categories_bucket CHECK (bucket IS NULL OR bucket IN ('formacion', 'laboral', 'familia'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activities (
  id CHAR(36) NOT NULL PRIMARY KEY,
  category_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  format VARCHAR(10) NOT NULL,
  photo_url VARCHAR(1000) NULL,
  visible TINYINT(1) NOT NULL DEFAULT 1,
  contact_name VARCHAR(255) NULL,            -- persona de contacto de esta actividad, opcional
  contact_phone VARCHAR(50) NULL,            -- vacío = el bubble usa el número general del centro
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT activities_format CHECK (format IN ('single', 'series')),
  CONSTRAINT activities_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Nombre público + dirección real (la dirección nunca sale por la API pública)
CREATE TABLE IF NOT EXISTS locations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cada instancia con fecha (single = 1 fila, series = N filas)
CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  activity_id CHAR(36) NOT NULL,
  date DATE NULL,                            -- null en recurrentes (ver weekday)
  weekday VARCHAR(20) NULL,                  -- ej. 'Lunes', solo recurrentes
  time_start TIME NULL,
  time_end TIME NULL,
  topic VARCHAR(500) NULL,
  speaker VARCHAR(255) NULL,
  location_id CHAR(36) NULL,
  price VARCHAR(100) NULL,                   -- texto libre, ej. "$10.000/matrimonio"
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sessions_date_or_weekday CHECK (date IS NOT NULL OR weekday IS NOT NULL),
  CONSTRAINT sessions_activity FOREIGN KEY (activity_id) REFERENCES activities (id) ON DELETE CASCADE,
  CONSTRAINT sessions_location FOREIGN KEY (location_id) REFERENCES locations (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS registrations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT registrations_session FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS posts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  image_url VARCHAR(1000) NULL,
  external_url VARCHAR(500) NOT NULL UNIQUE,
  published_at DATE NULL,
  source VARCHAR(100) NULL DEFAULT 'opusdei.org',
  visible TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_texts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  title VARCHAR(500) NOT NULL,
  excerpt TEXT NOT NULL,
  external_url VARCHAR(1000) NOT NULL,
  scraped_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
