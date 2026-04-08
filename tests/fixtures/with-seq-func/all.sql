CREATE TABLE users (
    id integer PRIMARY KEY,
    name text NOT NULL
);

CREATE SEQUENCE users_id_seq INCREMENT BY 1 MINVALUE 1 START WITH 1;
CREATE SEQUENCE order_number_seq INCREMENT BY 1 START WITH 1000;

CREATE OR REPLACE FUNCTION get_user_count() RETURNS integer AS $$
    SELECT count(*)::integer FROM users;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION get_active_users(status_param text) RETURNS SETOF users AS $$
    SELECT * FROM users WHERE name = status_param;
$$ LANGUAGE sql;

INSERT INTO roles (id, name) VALUES (1, 'admin');
