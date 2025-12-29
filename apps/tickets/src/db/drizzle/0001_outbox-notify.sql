-- Create PL/pgSQL trigger function to notify on inserts
CREATE OR REPLACE FUNCTION notify_outbox_insert()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('outbox_insert', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to outbox table
DROP TRIGGER IF EXISTS outbox_after_insert ON outbox;
CREATE TRIGGER outbox_after_insert
AFTER INSERT ON outbox
FOR EACH ROW
EXECUTE FUNCTION notify_outbox_insert();