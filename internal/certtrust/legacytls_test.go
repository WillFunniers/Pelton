package certtrust

import (
	"crypto/tls"
	"slices"
	"testing"
)

// The hosts 139 Mail answers on complete a handshake only with RSA key
// exchange, so they get the two AEAD suites added. Nothing else changes for
// them: the ECDHE suites crypto/tls would have offered must still be there, or a
// server that can do better would be pushed onto the weaker suite too.
func TestLegacyCiphersForHostsThatNeedThem(t *testing.T) {
	for _, host := range []string{"imap.139.com", "imap.10086.cn", "smtp.139.com", "smtp.10086.cn", "IMAP.139.COM", " imap.139.com "} {
		cfg, err := Trust{}.TLSConfig(host)
		if err != nil {
			t.Fatalf("TLSConfig(%q): %v", host, err)
		}
		if len(cfg.CipherSuites) != len(tls.CipherSuites())+2 {
			t.Errorf("%s: %d suites, want the %d defaults plus 2", host, len(cfg.CipherSuites), len(tls.CipherSuites()))
		}
		for _, want := range []uint16{tls.TLS_RSA_WITH_AES_128_GCM_SHA256, tls.TLS_RSA_WITH_AES_256_GCM_SHA384} {
			if !slices.Contains(cfg.CipherSuites, want) {
				t.Errorf("%s: %s missing", host, tls.CipherSuiteName(want))
			}
		}
		if !slices.Contains(cfg.CipherSuites, tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256) {
			t.Errorf("%s: the ECDHE suites were dropped, not extended", host)
		}
	}
}

// The CBC suites this server would also accept stay out: offering them buys
// nothing once GCM works, and they bring a padding oracle with them.
func TestLegacyCiphersExcludeCBC(t *testing.T) {
	cfg, err := Trust{}.TLSConfig("imap.139.com")
	if err != nil {
		t.Fatalf("TLSConfig: %v", err)
	}
	for _, unwanted := range []uint16{tls.TLS_RSA_WITH_AES_128_CBC_SHA, tls.TLS_RSA_WITH_AES_128_CBC_SHA256} {
		if slices.Contains(cfg.CipherSuites, unwanted) {
			t.Errorf("%s was added", tls.CipherSuiteName(unwanted))
		}
	}
}

// Every other host keeps exactly the config crypto/tls builds: an empty
// CipherSuites means "the defaults", which is what a nil slice means too.
func TestLegacyCiphersLeaveOtherHostsAlone(t *testing.T) {
	for _, host := range []string{"imap.gmail.com", "imap.163.com", "outlook.office365.com", "139.com", "notimap.139.com.evil.test"} {
		cfg, err := Trust{}.TLSConfig(host)
		if err != nil {
			t.Fatalf("TLSConfig(%q): %v", host, err)
		}
		if len(cfg.CipherSuites) != 0 {
			t.Errorf("%s: CipherSuites was set to %d entries, want the defaults", host, len(cfg.CipherSuites))
		}
		if cfg.MinVersion != tls.VersionTLS12 {
			t.Errorf("%s: MinVersion = %x, want TLS 1.2", host, cfg.MinVersion)
		}
	}
}

// A mailbox that also trusts a pinned certificate must still get the suites:
// the trust path returns its own config, and that is the one a 139 mailbox with
// a trusted certificate would use.
func TestLegacyCiphersApplyWithPinnedTrust(t *testing.T) {
	trust := Trust{Pins: []string{"aa:bb"}}
	cfg, err := trust.TLSConfig("imap.139.com")
	if err != nil {
		t.Fatalf("TLSConfig: %v", err)
	}
	if !slices.Contains(cfg.CipherSuites, tls.TLS_RSA_WITH_AES_256_GCM_SHA384) {
		t.Error("the pinned-trust config did not get the legacy suites")
	}
}
