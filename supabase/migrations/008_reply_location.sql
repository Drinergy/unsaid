-- 008: replies can show the replier's coarse place (city and country only, never coordinates),
-- the same way thoughts do. Nullable: older replies and replies without a detected place show only the time.

ALTER TABLE replies ADD COLUMN city TEXT CHECK (city IS NULL OR char_length(city) <= 100);
ALTER TABLE replies ADD COLUMN country_code CHAR(2);
