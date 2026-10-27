package oauth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"golang.org/x/oauth2"
)

// callback drives the loopback handler with the given query and reports what it
// pushed onto the code and error channels.
func callback(t *testing.T, state, query string) (code string, err error) {
	t.Helper()
	codeCh := make(chan string, 1)
	errCh := make(chan error, 1)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/callback?"+query, nil)
	callbackHandler(state, codeCh, errCh).ServeHTTP(recorder, request)

	select {
	case code = <-codeCh:
	default:
	}
	select {
	case err = <-errCh:
	default:
	}
	return code, err
}

func TestCallbackCapturesTheCode(t *testing.T) {
	code, err := callback(t, "expected-state", url.Values{
		"state": {"expected-state"},
		"code":  {"the-code"},
	}.Encode())

	if err != nil {
		t.Fatalf("callback reported %v", err)
	}
	if code != "the-code" {
		t.Errorf("captured code = %q, want %q", code, "the-code")
	}
}

// The state parameter is what ties the redirect back to the request this
// process started. A callback carrying someone else's state must never yield a
// code to exchange.
func TestCallbackRejectsAMismatchedState(t *testing.T) {
	code, err := callback(t, "expected-state", url.Values{
		"state": {"someone-elses-state"},
		"code":  {"the-code"},
	}.Encode())

	if code != "" {
		t.Errorf("captured code = %q, want none for a mismatched state", code)
	}
	if err == nil {
		t.Fatal("a mismatched state reported no error")
	}
	if !strings.Contains(err.Error(), "state mismatch") {
		t.Errorf("error = %v, want it to name the state mismatch", err)
	}
}

// A callback with no state at all is the same case, and is what a bare request
// to the loopback port looks like.
func TestCallbackRejectsAMissingState(t *testing.T) {
	code, err := callback(t, "expected-state", "code=the-code")

	if code != "" {
		t.Errorf("captured code = %q, want none when no state was sent", code)
	}
	if err == nil {
		t.Error("a missing state reported no error")
	}
}

// The provider reports a refused consent by redirecting with an error. That has
// to surface before the state check, since a denial carries no code either way.
func TestCallbackReportsAProviderError(t *testing.T) {
	code, err := callback(t, "expected-state", url.Values{
		"error": {"access_denied"},
		"state": {"expected-state"},
	}.Encode())

	if code != "" {
		t.Errorf("captured code = %q, want none after a provider error", code)
	}
	if err == nil {
		t.Fatal("a provider error reported no error")
	}
	if !strings.Contains(err.Error(), "access_denied") {
		t.Errorf("error = %v, want the provider's reason in it", err)
	}
}

func TestCallbackRejectsAMissingCode(t *testing.T) {
	code, err := callback(t, "expected-state", "state=expected-state")

	if code != "" {
		t.Errorf("captured code = %q, want none", code)
	}
	if err == nil {
		t.Error("a callback with no code reported no error")
	}
}

// A browser that prefetches or reloads the redirect hits the handler more than
// once. The channels hold one value, so the extra requests have to be dropped
// rather than blocking the handler goroutine forever.
func TestCallbackSurvivesARepeatedRequest(t *testing.T) {
	codeCh := make(chan string, 1)
	errCh := make(chan error, 1)
	handler := callbackHandler("expected-state", codeCh, errCh)

	done := make(chan struct{})
	go func() {
		defer close(done)
		for range 3 {
			handler.ServeHTTP(httptest.NewRecorder(),
				httptest.NewRequest(http.MethodGet, "/callback?state=expected-state&code=the-code", nil))
		}
	}()

	<-done
	if got := <-codeCh; got != "the-code" {
		t.Errorf("captured code = %q, want %q", got, "the-code")
	}
}

func TestRandomStateIsRandomAndHex(t *testing.T) {
	seen := map[string]bool{}
	for range 100 {
		state, err := randomState()
		if err != nil {
			t.Fatalf("randomState: %v", err)
		}
		if len(state) != 32 {
			t.Fatalf("state = %q, want 32 hex characters", state)
		}
		if seen[state] {
			t.Fatalf("randomState returned %q twice", state)
		}
		seen[state] = true
	}
}

// The ui offers whatever this returns, so a provider missing here cannot be
// picked at all, and every entry needs endpoints to be usable.
func TestProvidersAreCompletelyConfigured(t *testing.T) {
	labels := Providers()
	for _, key := range []string{"google", "microsoft"} {
		if labels[key] == "" {
			t.Errorf("Providers() has no label for %q", key)
		}
		p := providers[key]
		if p.AuthURL == "" || p.TokenURL == "" || len(p.Scopes) == 0 {
			t.Errorf("provider %q is missing endpoints or scopes: %+v", key, p)
		}
	}
	if len(labels) != len(providers) {
		t.Errorf("Providers() returned %d entries, want %d", len(labels), len(providers))
	}
}

// The public-client flow has no secret, so nothing may end up in the config
// unless a confidential-client registration passes one in.
func TestConfigLeavesTheSecretEmptyForAPublicClient(t *testing.T) {
	conf := config(providers["google"], "client-id", "", "http://127.0.0.1:1234/callback")

	if conf.ClientSecret != "" {
		t.Errorf("ClientSecret = %q, want empty for the public-client flow", conf.ClientSecret)
	}
	if conf.ClientID != "client-id" {
		t.Errorf("ClientID = %q, want the one passed in", conf.ClientID)
	}
	if conf.Endpoint.AuthURL != providers["google"].AuthURL {
		t.Errorf("AuthURL = %q, want the provider's", conf.Endpoint.AuthURL)
	}
}

// tokenServer stands in for a provider's token endpoint, counting the refresh
// requests it answers, and registers it as a provider for the test.
func tokenServer(t *testing.T) (key string, hits *int) {
	t.Helper()
	hits = new(int)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*hits++
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"access_token":"refreshed","token_type":"Bearer","expires_in":3600}`))
	}))
	t.Cleanup(server.Close)

	key = "test"
	providers[key] = Provider{Label: "Test", AuthURL: server.URL + "/auth", TokenURL: server.URL + "/token", Scopes: []string{"mail"}}
	t.Cleanup(func() { delete(providers, key) })
	return key, hits
}

// An unexpired cached token must be handed back without a round trip, or every
// imap and smtp connection costs a refresh.
func TestFreshTokenReusesAnUnexpiredToken(t *testing.T) {
	key, hits := tokenServer(t)
	cached := &oauth2.Token{AccessToken: "cached", RefreshToken: "refresh", Expiry: time.Now().Add(time.Hour)}

	token, err := FreshToken(context.Background(), key, "client-id", "", cached)
	if err != nil {
		t.Fatalf("FreshToken: %v", err)
	}
	if token.AccessToken != "cached" {
		t.Errorf("AccessToken = %q, want the cached one", token.AccessToken)
	}
	if *hits != 0 {
		t.Errorf("token endpoint hit %d times, want 0", *hits)
	}
}

func TestFreshTokenRefreshesAnExpiredToken(t *testing.T) {
	key, hits := tokenServer(t)
	cached := &oauth2.Token{AccessToken: "cached", RefreshToken: "refresh", Expiry: time.Now().Add(-time.Minute)}

	token, err := FreshToken(context.Background(), key, "client-id", "", cached)
	if err != nil {
		t.Fatalf("FreshToken: %v", err)
	}
	if token.AccessToken != "refreshed" {
		t.Errorf("AccessToken = %q, want the refreshed one", token.AccessToken)
	}
	if *hits != 1 {
		t.Errorf("token endpoint hit %d times, want 1", *hits)
	}
}
