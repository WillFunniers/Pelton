-- What a mailbox trusts beyond the system's certificate roots (#446).
--
-- Proton Mail Bridge and self-hosted servers present certificates no public
-- CA signed, so they failed verification with no way through. Trust is widened
-- per mailbox and only explicitly: nothing here turns verification off.

-- SHA-256 fingerprints of server certificates the user reviewed and accepted,
-- lowercase hex, one per line. Applies to the mailbox's imap and smtp servers.
-- Empty trusts nothing extra.
ALTER TABLE accounts ADD COLUMN trusted_certs TEXT NOT NULL DEFAULT '';

-- Extra root certificates the user supplied, PEM encoded, copied in when the
-- file was picked so trust survives the file moving. Empty adds none.
ALTER TABLE accounts ADD COLUMN ca_pem TEXT NOT NULL DEFAULT '';
