CREATE OR REPLACE FUNCTION get_user_count() RETURNS integer AS $$
    SELECT count(*)::integer FROM users;
$$ LANGUAGE sql;
