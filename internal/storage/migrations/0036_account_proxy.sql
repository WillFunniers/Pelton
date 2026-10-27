-- The route a mailbox's connections take (#457).
--
-- One app-wide proxy could not serve accounts that need different routes: a
-- proxy set for one account carried the others through it too. Each mailbox
-- now picks its own, and the default keeps following the app-wide setting.

-- '' follows the app-wide setting, 'off' connects directly, 'system' follows
-- the proxy environment variables and 'manual' uses the proxy below. The
-- password is in the keyring, never here.
ALTER TABLE accounts ADD COLUMN proxy_mode TEXT NOT NULL DEFAULT '';
ALTER TABLE accounts ADD COLUMN proxy_scheme TEXT NOT NULL DEFAULT '';
ALTER TABLE accounts ADD COLUMN proxy_host TEXT NOT NULL DEFAULT '';
ALTER TABLE accounts ADD COLUMN proxy_port INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN proxy_username TEXT NOT NULL DEFAULT '';

-- Whether the mailbox's contacts sync and its sign-in refresh leave the
-- mailbox's route and use the app-wide one. Both reach the same provider as
-- the mail, so by default they stay with it.
ALTER TABLE accounts ADD COLUMN proxy_contacts_global INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN proxy_oauth_global INTEGER NOT NULL DEFAULT 0;
