-- 007: new reaction set (felt, me_too, here_for_you, proud_of_you). "understood" is retired:
-- it overlapped with the others and read as "approved". Existing ones become "here_for_you".

ALTER TABLE reactions DROP CONSTRAINT IF EXISTS reactions_type_check;

UPDATE reactions SET type = 'here_for_you' WHERE type = 'understood';

ALTER TABLE reactions ADD CONSTRAINT reactions_type_check
    CHECK (type IN ('felt', 'me_too', 'here_for_you', 'proud_of_you'));
