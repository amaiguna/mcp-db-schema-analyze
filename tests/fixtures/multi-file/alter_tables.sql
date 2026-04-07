-- ALTER TABLE で後付けされるFK制約やカラム追加 (テーブル定義とは別ファイルで管理)

ALTER TABLE orders ADD CONSTRAINT fk_orders_user_id FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE order_items ADD CONSTRAINT fk_order_items_order_id FOREIGN KEY (order_id) REFERENCES orders(id);

-- 後からカラムを追加するケース
ALTER TABLE users ADD COLUMN phone varchar(20);
