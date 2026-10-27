package desktop

import (
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/peltonapp/Pelton/internal/credentials"
	"github.com/peltonapp/Pelton/internal/proxy"
	"github.com/peltonapp/Pelton/internal/storage"
)

// routedAccount creates a mailbox and returns it as stored.
func routedAccount(t *testing.T, a *App, p storage.AccountProxy) storage.Account {
	t.Helper()
	id, err := a.store.CreateAccount(a.ctx, &storage.Account{
		Email: "routed@example.test", IMAPHost: "imap.example.test", IMAPPort: 993,
		SMTPHost: "smtp.example.test", SMTPPort: 465, Proxy: p,
	})
	if err != nil {
		t.Fatalf("create account: %v", err)
	}
	account, err := a.store.GetAccount(a.ctx, id)
	if err != nil {
		t.Fatalf("get account: %v", err)
	}
	return *account
}

func TestAccountRouteFollowsTheMailboxNotTheAppSetting(t *testing.T) {
	a := newAccountTestApp(t)
	a.proxyCfg = proxy.Config{Mode: proxy.ModeManual, Scheme: proxy.SchemeSOCKS5, Host: "global.example", Port: 1080}

	manual := storage.AccountProxy{Mode: storage.AccountProxyManual, Scheme: proxy.SchemeHTTP, Host: "own.example", Port: 8080, Username: "me"}
	for _, tt := range []struct {
		name  string
		proxy storage.AccountProxy
		want  proxy.Config
	}{
		{"global", storage.AccountProxy{}, a.proxyCfg},
		// direct has to mean direct even with an app-wide proxy set: that is
		// the case the issue is about.
		{"direct", storage.AccountProxy{Mode: storage.AccountProxyDirect}, proxy.Config{Mode: proxy.ModeOff}},
		{"system", storage.AccountProxy{Mode: storage.AccountProxySystem}, proxy.Config{Mode: proxy.ModeSystem}},
		{"manual", manual, proxy.Config{Mode: proxy.ModeManual, Scheme: proxy.SchemeHTTP, Host: "own.example", Port: 8080, Username: "me", Password: "secret"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			account := routedAccount(t, a, tt.proxy)
			if err := credentials.StoreAccountProxyPassword(account.ID, "secret"); err != nil {
				t.Fatalf("store proxy password: %v", err)
			}
			t.Cleanup(func() { _ = credentials.DeleteAccountProxyPassword(account.ID) })

			got, err := a.accountRoute(account)
			if err != nil {
				t.Fatalf("accountRoute: %v", err)
			}
			if got != tt.want {
				t.Errorf("accountRoute = %+v, want %+v", got, tt.want)
			}
		})
	}
}

// A mode nobody knows must fail the connection rather than quietly going
// direct, which could reveal the address the proxy was there to hide.
func TestAccountRouteRefusesAnUnknownMode(t *testing.T) {
	a := newAccountTestApp(t)
	_, err := a.accountRoute(storage.Account{Proxy: storage.AccountProxy{Mode: "tor"}})
	if !errors.Is(err, errUnknownProxyMode) {
		t.Errorf("accountRoute(unknown mode) error = %v, want errUnknownProxyMode", err)
	}
}

func TestAccountProxyFromDTOValidatesAManualProxy(t *testing.T) {
	if _, err := accountProxyFromDTO(AccountProxyDTO{Mode: proxy.ModeManual, Scheme: proxy.SchemeSOCKS5, Port: 1080}); err == nil {
		t.Error("a manual proxy without a host was accepted")
	}
	if _, err := accountProxyFromDTO(AccountProxyDTO{Mode: "vpn"}); !errors.Is(err, errUnknownProxyMode) {
		t.Errorf("unknown mode error = %v, want errUnknownProxyMode", err)
	}
	got, err := accountProxyFromDTO(AccountProxyDTO{Mode: accountProxyGlobal, Host: "kept.example"})
	if err != nil {
		t.Fatalf("global: %v", err)
	}
	if got.Mode != storage.AccountProxyGlobal || got.Host != "kept.example" {
		t.Errorf("global = %+v, want the empty mode with the typed host kept", got)
	}
}

// Contacts and sign-in take the mailbox's route unless told to use the
// app-wide one; with no proxy anywhere both are direct.
func TestAccountHTTPClientHonoursUseGlobal(t *testing.T) {
	a := newAccountTestApp(t)
	a.proxyCfg = proxy.Config{Mode: proxy.ModeOff}
	account := routedAccount(t, a, storage.AccountProxy{Mode: storage.AccountProxyManual, Scheme: proxy.SchemeHTTP, Host: "own.example", Port: 8080})

	own, err := a.accountHTTPClient(account, false, oauthTimeout)
	if err != nil {
		t.Fatalf("own route: %v", err)
	}
	if proxyHost(t, own) != "own.example:8080" {
		t.Errorf("own route goes through %q, want own.example:8080", proxyHost(t, own))
	}
	global, err := a.accountHTTPClient(account, true, oauthTimeout)
	if err != nil {
		t.Fatalf("global route: %v", err)
	}
	if host := proxyHost(t, global); host != "" {
		t.Errorf("global route goes through %q, want direct", host)
	}
}

func TestUpdateAccountStoresTheRouteAndItsPassword(t *testing.T) {
	a := newAccountTestApp(t)
	account := routedAccount(t, a, storage.AccountProxy{})
	req := UpdateAccountRequest{
		ID: account.ID, IMAPHost: account.IMAPHost, IMAPPort: account.IMAPPort,
		SMTPHost: account.SMTPHost, SMTPPort: account.SMTPPort,
		Proxy: AccountProxyDTO{Mode: proxy.ModeManual, Scheme: proxy.SchemeSOCKS5, Host: "own.example", Port: 1080, Password: "pw", OAuthUseGlobal: true},
	}

	dto, err := a.UpdateAccount(req)
	if err != nil {
		t.Fatalf("UpdateAccount: %v", err)
	}
	t.Cleanup(func() { _ = credentials.DeleteAccountProxyPassword(account.ID) })
	if dto.Proxy.Mode != proxy.ModeManual || dto.Proxy.Host != "own.example" || !dto.Proxy.OAuthUseGlobal {
		t.Errorf("returned proxy = %+v", dto.Proxy)
	}
	if dto.Proxy.Password != "" {
		t.Error("the proxy password came back out to the ui")
	}
	if pw, _ := credentials.LoadAccountProxyPassword(account.ID); pw != "pw" {
		t.Errorf("stored proxy password = %q, want pw", pw)
	}

	// the placeholder left untouched keeps the password
	req.Proxy.Password, req.Proxy.HasPassword = "", true
	if _, err := a.UpdateAccount(req); err != nil {
		t.Fatalf("UpdateAccount keeping the password: %v", err)
	}
	if pw, _ := credentials.LoadAccountProxyPassword(account.ID); pw != "pw" {
		t.Errorf("after keeping, proxy password = %q, want pw", pw)
	}

	// leaving the manual proxy clears it
	req.Proxy.Mode = proxy.ModeOff
	if _, err := a.UpdateAccount(req); err != nil {
		t.Fatalf("UpdateAccount going direct: %v", err)
	}
	if pw, _ := credentials.LoadAccountProxyPassword(account.ID); pw != "" {
		t.Errorf("after going direct, proxy password = %q, want it cleared", pw)
	}
}

// An invalid route is refused before anything is written, so a typo in the
// proxy host cannot leave the rest of the edit half saved.
func TestUpdateAccountRejectsABadRouteBeforeSaving(t *testing.T) {
	a := newAccountTestApp(t)
	account := routedAccount(t, a, storage.AccountProxy{})

	_, err := a.UpdateAccount(UpdateAccountRequest{
		ID: account.ID, DisplayName: "Changed", IMAPHost: account.IMAPHost, IMAPPort: account.IMAPPort,
		Proxy: AccountProxyDTO{Mode: proxy.ModeManual, Scheme: proxy.SchemeSOCKS5, Port: 1080},
	})
	if err == nil {
		t.Fatal("UpdateAccount accepted a manual proxy without a host")
	}
	stored, _ := a.store.GetAccount(a.ctx, account.ID)
	if stored.DisplayName == "Changed" {
		t.Error("the rest of the edit was saved despite the bad route")
	}
}

func TestTestAccountRouteReachesBothServers(t *testing.T) {
	a := newAccountTestApp(t)
	a.proxyCfg = proxy.Config{Mode: proxy.ModeOff}
	imapHost, imapPort := listen(t)
	smtpHost, smtpPort := listen(t)

	err := a.TestAccountRoute(RouteTestRequest{
		Proxy:    AccountProxyDTO{Mode: accountProxyGlobal},
		IMAPHost: imapHost, IMAPPort: imapPort, SMTPHost: smtpHost, SMTPPort: smtpPort,
	})
	if err != nil {
		t.Errorf("TestAccountRoute against listening servers: %v", err)
	}

	// a proxy nothing listens on has to fail the test, not pass it directly.
	proxyHostAddr, proxyPort := deadPort(t)
	err = a.TestAccountRoute(RouteTestRequest{
		Proxy:    AccountProxyDTO{Mode: proxy.ModeManual, Scheme: proxy.SchemeSOCKS5, Host: proxyHostAddr, Port: proxyPort},
		IMAPHost: imapHost, IMAPPort: imapPort,
	})
	if err == nil {
		t.Error("TestAccountRoute passed through a proxy that is not there")
	}
}

// proxyHost is where a client's transport sends a request to example.com,
// empty for a direct connection.
func proxyHost(t *testing.T, client *http.Client) string {
	t.Helper()
	transport, ok := client.Transport.(*http.Transport)
	if !ok || transport.Proxy == nil {
		return ""
	}
	u, err := transport.Proxy(httptest.NewRequest(http.MethodGet, "https://example.com", nil))
	if err != nil {
		t.Fatalf("resolve proxy: %v", err)
	}
	if u == nil {
		return ""
	}
	return u.Host
}

// deadPort is a local port nothing listens on any more.
func deadPort(t *testing.T) (string, int) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	host, port, _ := net.SplitHostPort(ln.Addr().String())
	_ = ln.Close()
	n, _ := strconv.Atoi(port)
	return host, n
}

// listen opens a local port that accepts connections, and returns it.
func listen(t *testing.T) (string, int) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			_ = conn.Close()
		}
	}()
	host, port, _ := net.SplitHostPort(ln.Addr().String())
	n, _ := strconv.Atoi(port)
	return host, n
}
