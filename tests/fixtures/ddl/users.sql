CREATE TABLE users (
    id serial PRIMARY KEY,
    name varchar(255) NOT NULL,
    email varchar(255) NOT NULL,
    role_id integer REFERENCES roles(id),
    created_at timestamp DEFAULT now()
);

COMMENT ON TABLE users IS 'ユーザー管理テーブル';
COMMENT ON COLUMN users.name IS 'ユーザー名';
COMMENT ON COLUMN users.email IS 'メールアドレス';

CREATE UNIQUE INDEX idx_users_email ON users (email);
