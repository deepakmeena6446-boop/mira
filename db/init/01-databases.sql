-- Separate databases so automated tests never touch development data.
CREATE DATABASE mira_test OWNER mira;
CREATE DATABASE mira_e2e OWNER mira;
