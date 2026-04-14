-- Bot user system + pool simulator support.

-- 1) Users: bot flags
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_created_by INTEGER REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_region TEXT;

-- 2) Pool tickets: mark simulated tickets (admin simulator/bots)
ALTER TABLE pool_tickets ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN NOT NULL DEFAULT false;

-- 3) Admin actions: audit trail (if not already created in older DBs)
CREATE TABLE IF NOT EXISTS admin_actions (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL,
  target_id INTEGER,
  action_type TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4) Bot name pool + seed (100+ realistic names)
CREATE TABLE IF NOT EXISTS bot_name_pool (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  last_initial VARCHAR(1) NOT NULL,
  region VARCHAR(20) NOT NULL DEFAULT 'pk'
);

-- Seed only if empty
INSERT INTO bot_name_pool (first_name, last_initial, region)
SELECT x.first_name, x.last_initial, x.region
FROM (
  VALUES
  -- Pakistan (pk)
  ('Ahmed','K','pk'),('Faizan','I','pk'),('Hamza','J','pk'),('Bilal','R','pk'),('Usman','A','pk'),
  ('Aamir','O','pk'),('Zohaib','Z','pk'),('Irfan','M','pk'),('Saad','H','pk'),('Omar','B','pk'),
  ('Ali','N','pk'),('Hasan','S','pk'),('Rizwan','T','pk'),('Shahid','P','pk'),('Kamran','D','pk'),
  ('Asad','F','pk'),('Tariq','L','pk'),('Waqar','G','pk'),('Nabeel','C','pk'),('Junaid','W','pk'),
  ('Ahsan','Q','pk'),('Zeeshan','Y','pk'),('Saqib','E','pk'),('Waleed','V','pk'),('Imran','U','pk'),
  ('Arsalan','R','pk'),('Danish','K','pk'),('Hassan','A','pk'),('Sami','N','pk'),('Muneeb','S','pk'),
  ('Adeel','T','pk'),('Shayan','M','pk'),('Huzaifa','H','pk'),('Sameer','I','pk'),('Fahad','J','pk'),
  ('Yasir','B','pk'),('Zubair','L','pk'),('Farhan','P','pk'),('Nouman','D','pk'),('Umair','F','pk'),
  ('Ayesha','K','pk'),('Fatima','S','pk'),('Maryam','A','pk'),('Sana','R','pk'),('Hira','Z','pk'),
  ('Noor','M','pk'),('Amna','T','pk'),('Zainab','H','pk'),('Iqra','B','pk'),('Laiba','N','pk'),
  ('Mehwish','S','pk'),('Mahnoor','A','pk'),('Anum','R','pk'),('Eman','K','pk'),('Kiran','M','pk'),

  -- India (in)
  ('Rahul','S','in'),('Priya','M','in'),('Amit','V','in'),('Neha','G','in'),('Vikram','P','in'),
  ('Ankit','D','in'),('Rohit','K','in'),('Pooja','R','in'),('Deepak','L','in'),('Sneha','B','in'),
  ('Arjun','N','in'),('Kavita','J','in'),('Suresh','T','in'),('Karan','A','in'),('Isha','H','in'),
  ('Nikhil','C','in'),('Meera','S','in'),('Varun','R','in'),('Asha','P','in'),('Sanjay','D','in'),
  ('Riya','K','in'),('Manish','M','in'),('Naina','G','in'),('Dev','S','in'),('Lakshmi','V','in'),
  ('Aditya','N','in'),('Simran','J','in'),('Pankaj','B','in'),('Divya','T','in'),('Sahil','R','in'),
  ('Tanya','K','in'),('Harsh','M','in'),('Vivek','D','in'),('Anjali','S','in'),('Rakesh','P','in'),

  -- UAE/Arab (uae)
  ('Mohammed','A','uae'),('Khalid','H','uae'),('Rashid','M','uae'),('Fatima','N','uae'),('Aisha','K','uae'),
  ('Yusuf','S','uae'),('Ibrahim','R','uae'),('Sara','O','uae'),('Ahmad','T','uae'),('Layla','B','uae'),
  ('Omar','K','uae'),('Hamad','S','uae'),('Noor','A','uae'),('Mariam','H','uae'),('Salem','M','uae'),
  ('Zain','R','uae'),('Amir','T','uae'),('Huda','B','uae'),('Noura','S','uae'),('Bilal','A','uae')
) AS x(first_name, last_initial, region)
WHERE NOT EXISTS (SELECT 1 FROM bot_name_pool LIMIT 1);

