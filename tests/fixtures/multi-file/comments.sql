-- コメント定義のみ (テーブル定義とは別ファイルで管理)

COMMENT ON TABLE users IS 'ユーザー管理テーブル';
COMMENT ON COLUMN users.name IS 'ユーザー名';
COMMENT ON COLUMN users.email IS 'メールアドレス';

COMMENT ON TABLE orders IS '注文テーブル';
COMMENT ON COLUMN orders.total IS '合計金額';

COMMENT ON TABLE order_items IS '注文明細テーブル';
