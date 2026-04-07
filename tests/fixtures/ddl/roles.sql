CREATE TABLE roles (
    id serial PRIMARY KEY,
    name varchar(100) NOT NULL
);

COMMENT ON TABLE roles IS 'ロールマスタ';
