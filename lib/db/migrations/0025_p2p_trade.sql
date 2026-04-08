-- P2P USDT trading: offers, orders, escrow (withdrawable lock), chat, appeals.

DO $$ BEGIN
  CREATE TYPE p2p_offer_side AS ENUM ('sell_usdt', 'buy_usdt');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE p2p_order_status AS ENUM ('pending_payment', 'paid', 'completed', 'cancelled', 'expired', 'disputed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE p2p_appeal_status AS ENUM ('under_review', 'resolved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS p2p_offers (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users (id),
  side p2p_offer_side NOT NULL,
  price_per_usdt numeric(18, 4) NOT NULL,
  fiat_currency text NOT NULL DEFAULT 'PKR',
  min_usdt numeric(18, 2) NOT NULL,
  max_usdt numeric(18, 2) NOT NULL,
  available_usdt numeric(18, 2) NOT NULL,
  methods jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_time_label text DEFAULT 'Usually replies in 15 min',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_p2p_offers_user_id ON p2p_offers (user_id);
CREATE INDEX IF NOT EXISTS idx_p2p_offers_side_active ON p2p_offers (side, active);

CREATE TABLE IF NOT EXISTS p2p_orders (
  id serial PRIMARY KEY,
  offer_id integer NOT NULL REFERENCES p2p_offers (id),
  buyer_user_id integer NOT NULL REFERENCES users (id),
  seller_user_id integer NOT NULL REFERENCES users (id),
  usdt_amount numeric(18, 2) NOT NULL,
  price_per_usdt numeric(18, 4) NOT NULL,
  fiat_total numeric(18, 2) NOT NULL,
  fiat_currency text NOT NULL,
  status p2p_order_status NOT NULL DEFAULT 'pending_payment',
  payment_deadline_at timestamptz NOT NULL,
  paid_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_p2p_orders_buyer ON p2p_orders (buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_p2p_orders_seller ON p2p_orders (seller_user_id);
CREATE INDEX IF NOT EXISTS idx_p2p_orders_status ON p2p_orders (status);

CREATE TABLE IF NOT EXISTS p2p_messages (
  id serial PRIMARY KEY,
  order_id integer NOT NULL REFERENCES p2p_orders (id) ON DELETE CASCADE,
  from_user_id integer REFERENCES users (id),
  body text NOT NULL DEFAULT '',
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_p2p_messages_order_id ON p2p_messages (order_id);

CREATE TABLE IF NOT EXISTS p2p_appeals (
  id serial PRIMARY KEY,
  order_id integer NOT NULL UNIQUE REFERENCES p2p_orders (id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users (id),
  message text NOT NULL,
  screenshots jsonb NOT NULL DEFAULT '[]'::jsonb,
  status p2p_appeal_status NOT NULL DEFAULT 'under_review',
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TYPE tx_type ADD VALUE 'p2p_escrow_lock';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE tx_type ADD VALUE 'p2p_escrow_refund';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE tx_type ADD VALUE 'p2p_trade_credit';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
