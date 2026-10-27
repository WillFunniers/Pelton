package desktop

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/peltonapp/Pelton/internal/credentials"
	"github.com/peltonapp/Pelton/internal/storage"
	"golang.org/x/oauth2"
)

// memSecrets is a secretStore backed by a map, standing in for the os keyring.
type memSecrets map[int64]credentials.Secret

func (m memSecrets) Load(accountID int64) (credentials.Secret, error) {
	s, ok := m[accountID]
	if !ok {
		return credentials.Secret{}, credentials.ErrNotFound
	}
	return s, nil
}

func (m memSecrets) Store(accountID int64, s credentials.Secret) error {
	m[accountID] = s
	return nil
}

// authorizeCall records what the consent flow was started with.
type authorizeCall struct {
	provider, clientID, clientSecret, loginHint string
}

// oauthTestApp returns an app with an in-memory keyring, one account, and a
// consent flow that answers with token (or err) instead of opening a browser.
func oauthTestApp(t *testing.T, token *oauth2.Token, err error) (*App, int64, memSecrets, *[]authorizeCall) {
	t.Helper()
	a := newAccountTestApp(t)
	secrets := memSecrets{}
	a.secrets = secrets
	calls := &[]authorizeCall{}
	a.oauthAuthorize = func(_ context.Context, provider, clientID, clientSecret, loginHint string, _ func(string)) (*oauth2.Token, error) {
		*calls = append(*calls, authorizeCall{provider, clientID, clientSecret, loginHint})
		return token, err
	}
	id, cerr := a.store.CreateAccount(a.ctx, &storage.Account{Email: "student@uni.example", IMAPHost: "imap.gmail.com", IMAPPort: 993})
	if cerr != nil {
		t.Fatalf("create account: %v", cerr)
	}
	return a, id, secrets, calls
}

// expiredGoogleSecret is an oauth secret whose refresh token the provider has
// stopped honouring, the state "sign in again" exists for.
func expiredGoogleSecret() credentials.Secret {
	return credentials.Secret{
		Method:       credentials.MethodOAuth,
		Provider:     "google",
		ClientID:     "client-id",
		ClientSecret: "client-secret",
		RefreshToken: "dead-refresh",
		AccessToken:  "dead-access",
		Expiry:       time.Now().Add(-time.Hour),
	}
}

func TestAccountOAuthProvider(t *testing.T) {
	a, id, secrets, _ := oauthTestApp(t, nil, nil)

	for _, tt := range []struct {
		name   string
		secret *credentials.Secret
		want   string
	}{
		// an imported mailbox arrives with nothing stored; it is a password
		// account still waiting for its password.
		{"nothing stored", nil, ""},
		{"password", &credentials.Secret{Method: credentials.MethodPassword, Password: "pw"}, ""},
		{"oauth", &credentials.Secret{Method: credentials.MethodOAuth, Provider: "google"}, "google"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			delete(secrets, id)
			if tt.secret != nil {
				secrets[id] = *tt.secret
			}
			got, err := a.AccountOAuthProvider(id)
			if err != nil {
				t.Fatalf("AccountOAuthProvider: %v", err)
			}
			if got != tt.want {
				t.Errorf("AccountOAuthProvider() = %q, want %q", got, tt.want)
			}
		})
	}
}

// Signing in again must reuse the client the mailbox was set up with and swap
// in the new tokens, so the sync loops' next attempt succeeds.
func TestReauthorizeOAuthAccountReplacesTheTokens(t *testing.T) {
	expiry := time.Now().Add(time.Hour)
	a, id, secrets, calls := oauthTestApp(t, &oauth2.Token{AccessToken: "new-access", RefreshToken: "new-refresh", Expiry: expiry}, nil)
	secrets[id] = expiredGoogleSecret()
	a.rejectedLogins = map[int64]struct{}{id: {}}

	if err := a.ReauthorizeOAuthAccount(id); err != nil {
		t.Fatalf("ReauthorizeOAuthAccount: %v", err)
	}

	want := authorizeCall{provider: "google", clientID: "client-id", clientSecret: "client-secret", loginHint: "student@uni.example"}
	if len(*calls) != 1 || (*calls)[0] != want {
		t.Fatalf("consent flow started with %+v, want once with %+v", *calls, want)
	}
	got := secrets[id]
	if got.RefreshToken != "new-refresh" || got.AccessToken != "new-access" || !got.Expiry.Equal(expiry) {
		t.Errorf("stored tokens = %+v, want the new ones", got)
	}
	if got.Method != credentials.MethodOAuth || got.Provider != "google" || got.ClientID != "client-id" || got.ClientSecret != "client-secret" {
		t.Errorf("stored client = %+v, want the original client kept", got)
	}
	if a.loginRejected(id) {
		t.Error("login still marked as rejected after signing in again")
	}
}

// A password mailbox has no provider to go back to; the consent flow must not
// even open.
func TestReauthorizeOAuthAccountRefusesAPasswordAccount(t *testing.T) {
	a, id, secrets, calls := oauthTestApp(t, nil, nil)
	secrets[id] = credentials.Secret{Method: credentials.MethodPassword, Password: "pw"}

	if err := a.ReauthorizeOAuthAccount(id); !errors.Is(err, errAccountUsesPassword) {
		t.Fatalf("ReauthorizeOAuthAccount() error = %v, want errAccountUsesPassword", err)
	}
	if len(*calls) != 0 {
		t.Errorf("consent flow started %d times, want 0", len(*calls))
	}
	if secrets[id].Password != "pw" {
		t.Errorf("stored secret = %+v, want the password left alone", secrets[id])
	}
}

// A failed or refresh-token-less sign-in must leave the stored secret as it
// was rather than half-replacing it.
func TestReauthorizeOAuthAccountKeepsTheSecretOnFailure(t *testing.T) {
	for _, tt := range []struct {
		name  string
		token *oauth2.Token
		err   error
	}{
		{"consent failed", nil, errors.New("oauth: provider error: access_denied")},
		{"no refresh token", &oauth2.Token{AccessToken: "new-access"}, nil},
	} {
		t.Run(tt.name, func(t *testing.T) {
			a, id, secrets, _ := oauthTestApp(t, tt.token, tt.err)
			before := expiredGoogleSecret()
			secrets[id] = before

			if err := a.ReauthorizeOAuthAccount(id); err == nil {
				t.Fatal("ReauthorizeOAuthAccount() returned no error")
			}
			if secrets[id] != before {
				t.Errorf("stored secret = %+v, want it unchanged", secrets[id])
			}
		})
	}
}
