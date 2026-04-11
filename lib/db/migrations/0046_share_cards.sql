-- Shareable social cards + analytics

CREATE TABLE IF NOT EXISTS share_cards (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_type VARCHAR(30) NOT NULL,
  card_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  image_url TEXT,
  share_count INT NOT NULL DEFAULT 0,
  shared_platforms TEXT[] NOT NULL DEFAULT '{}',
  referral_code VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_cards_user ON share_cards (user_id);
CREATE INDEX IF NOT EXISTS idx_share_cards_type ON share_cards (card_type);
CREATE INDEX IF NOT EXISTS idx_share_cards_created ON share_cards (created_at DESC);

CREATE TABLE IF NOT EXISTS share_analytics (
  id SERIAL PRIMARY KEY,
  share_card_id INT REFERENCES share_cards(id) ON DELETE SET NULL,
  platform VARCHAR(20),
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resulted_in_signup BOOLEAN NOT NULL DEFAULT FALSE,
  new_user_id INT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_share_analytics_card ON share_analytics (share_card_id);
CREATE INDEX IF NOT EXISTS idx_share_analytics_clicked ON share_analytics (clicked_at DESC);
