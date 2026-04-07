CREATE TABLE orders (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id),
    total numeric(10,2) NOT NULL,
    status varchar(50) DEFAULT 'pending',
    ordered_at timestamp DEFAULT now()
);

COMMENT ON TABLE orders IS '注文テーブル';
COMMENT ON COLUMN orders.total IS '合計金額';

CREATE INDEX idx_orders_user_id ON orders (user_id);
CREATE INDEX idx_orders_status ON orders (status);
