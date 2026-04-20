-- Tested Electrical Database Schema
-- Run this in Railway's Postgres console once

CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  company VARCHAR(255),
  is_agency BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  job_number VARCHAR(50) UNIQUE NOT NULL,
  client_id INTEGER REFERENCES clients(id),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  site_address TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  -- status: pending, active, completed, invoiced
  source VARCHAR(100), -- email, sms, manual
  work_order_ref VARCHAR(255),
  agency_contact VARCHAR(255),
  scheduled_date DATE,
  completed_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotes (
  id SERIAL PRIMARY KEY,
  quote_number VARCHAR(50) UNIQUE NOT NULL,
  job_id INTEGER REFERENCES jobs(id),
  client_id INTEGER REFERENCES clients(id),
  line_items JSONB NOT NULL DEFAULT '[]',
  subtotal DECIMAL(10,2) DEFAULT 0,
  gst DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  -- status: draft, sent, accepted, declined, expired
  valid_days INTEGER DEFAULT 14,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  job_id INTEGER REFERENCES jobs(id),
  client_id INTEGER REFERENCES clients(id),
  quote_id INTEGER REFERENCES quotes(id),
  line_items JSONB NOT NULL DEFAULT '[]',
  subtotal DECIMAL(10,2) DEFAULT 0,
  gst DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'draft',
  -- status: draft, sent, paid, overdue
  due_date DATE,
  sent_at TIMESTAMP,
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  report_number VARCHAR(50) UNIQUE NOT NULL,
  job_id INTEGER REFERENCES jobs(id),
  client_id INTEGER REFERENCES clients(id),
  title VARCHAR(500),
  task_information TEXT,
  investigation_findings TEXT,
  work_undertaken TEXT,
  remedial_action TEXT,
  recommended_followup TEXT,
  price_ex_gst DECIMAL(10,2),
  conducted_date DATE,
  status VARCHAR(50) DEFAULT 'draft',
  -- status: draft, sent
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emails (
  id SERIAL PRIMARY KEY,
  gmail_message_id VARCHAR(255) UNIQUE,
  from_address VARCHAR(255),
  from_name VARCHAR(255),
  subject TEXT,
  body TEXT,
  received_at TIMESTAMP,
  processed BOOLEAN DEFAULT false,
  job_id INTEGER REFERENCES jobs(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sms_log (
  id SERIAL PRIMARY KEY,
  direction VARCHAR(10), -- inbound, outbound
  from_number VARCHAR(50),
  to_number VARCHAR(50),
  body TEXT,
  job_id INTEGER REFERENCES jobs(id),
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Auto-increment sequences for readable numbers
CREATE SEQUENCE IF NOT EXISTS job_number_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS quote_number_seq START 191;
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 51085;
CREATE SEQUENCE IF NOT EXISTS report_number_seq START 1047;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_emails_processed ON emails(processed);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
