-- テーブル定義のみ (INDEX, ALTER TABLE は別ファイルで管理)

CREATE TABLE users (
    id serial PRIMARY KEY,
    name varchar(255) NOT NULL,
    email varchar(255) NOT NULL
);

CREATE TABLE orders (
    id serial PRIMARY KEY,
    user_id integer NOT NULL,
    total numeric(10,2),
    status varchar(50) DEFAULT 'pending'
);

CREATE TABLE order_items (
    id serial PRIMARY KEY,
    order_id integer NOT NULL,
    product_name varchar(255) NOT NULL,
    quantity integer NOT NULL,
    price numeric(10,2) NOT NULL
);
