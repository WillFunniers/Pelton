package desktop

import (
	"context"

	"github.com/peltonapp/Pelton/internal/credentials"
	"github.com/peltonapp/Pelton/internal/oauth"
	"golang.org/x/oauth2"
)

// secretStore is the slice of the keyring the oauth bindings use, so a test
// can hand them a map instead of the developer's real os keyring, where
// account ids collide with whatever is installed.
type secretStore interface {
	Load(accountID int64) (credentials.Secret, error)
	Store(accountID int64, s credentials.Secret) error
}

// osKeyring is the real secretStore.
type osKeyring struct{}

func (osKeyring) Load(accountID int64) (credentials.Secret, error) {
	return credentials.Load(accountID)
}

func (osKeyring) Store(accountID int64, s credentials.Secret) error {
	return credentials.Store(accountID, s)
}

// secretStore returns the keyring, or the test's substitute when one is set.
func (a *App) secretStore() secretStore {
	if a.secrets != nil {
		return a.secrets
	}
	return osKeyring{}
}

// authorize runs the oauth consent flow, or the test's substitute when one is
// set.
func (a *App) authorize(ctx context.Context, provider, clientID, clientSecret, loginHint string, open func(string)) (*oauth2.Token, error) {
	if a.oauthAuthorize != nil {
		return a.oauthAuthorize(ctx, provider, clientID, clientSecret, loginHint, open)
	}
	return oauth.Authorize(ctx, provider, clientID, clientSecret, loginHint, open)
}
