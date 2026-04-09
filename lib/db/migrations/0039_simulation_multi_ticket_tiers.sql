ALTER TABLE simulation_config
ADD COLUMN IF NOT EXISTS simulated_ticket_tiers text NOT NULL DEFAULT '2,5,10';

