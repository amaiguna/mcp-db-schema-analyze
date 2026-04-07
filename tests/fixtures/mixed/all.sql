-- DDLとDMLが混在したファイル (prepare コマンドで正規化されることを想定)

CREATE TABLE users (
    id serial PRIMARY KEY,
    name varchar(255) NOT NULL,
    email varchar(255) NOT NULL
);

COMMENT ON TABLE users IS 'ユーザーテーブル';
COMMENT ON COLUMN users.email IS 'メールアドレス';

CREATE UNIQUE INDEX idx_users_email ON users (email);

CREATE TABLE orders (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users(id),
    total numeric(10,2)
);

INSERT INTO roles (id, name) VALUES (1, 'admin');
INSERT INTO roles (id, name) VALUES (2, 'member');
