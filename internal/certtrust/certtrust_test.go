package certtrust

import (
	"crypto/tls"
	"encoding/pem"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// selfSigned starts a TLS server with httptest's self-signed certificate, the
// shape of what Proton Mail Bridge or a home server presents.
func selfSigned(t *testing.T) (addr string, fingerprint string, caPEM string) {
	t.Helper()
	server := httptest.NewTLSServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	t.Cleanup(server.Close)
	cert := server.Certificate()
	block := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: cert.Raw})
	return server.Listener.Addr().String(), Fingerprint(cert), string(block)
}

// handshake dials addr with the trust's config and reports the handshake error.
func handshake(t *testing.T, trust Trust, addr string) error {
	t.Helper()
	cfg, err := trust.TLSConfig("127.0.0.1")
	if err != nil {
		t.Fatalf("TLSConfig: %v", err)
	}
	conn, err := tls.Dial("tcp", addr, cfg)
	if err != nil {
		return err
	}
	return conn.Close()
}

// Without extra trust a self-signed server must fail as it always has, and the
// failure has to carry the certificate so the ui can offer to trust it.
func TestAnUntrustedCertificateFailsAndIsReported(t *testing.T) {
	addr, fp, _ := selfSigned(t)

	err := handshake(t, Trust{}, addr)
	cert, ok := Untrusted(err)
	if !ok {
		t.Fatalf("Untrusted(%v) found no certificate", err)
	}
	if Fingerprint(cert) != fp {
		t.Errorf("reported fingerprint %s, want the server's %s", Fingerprint(cert), fp)
	}
}

func TestAPinnedCertificateIsAccepted(t *testing.T) {
	addr, fp, _ := selfSigned(t)

	// pins are accepted in the display spelling the user may have copied.
	if err := handshake(t, Trust{Pins: []string{DisplayFingerprint(fp)}}, addr); err != nil {
		t.Errorf("handshake with the pin: %v", err)
	}
}

// Trusting one certificate must not trust a different one, which is what
// warns the user when the server's certificate changes.
func TestADifferentPinIsStillRefused(t *testing.T) {
	addr, fp, _ := selfSigned(t)
	other := strings.Repeat("ab", 32)
	if other == fp {
		t.Fatal("test fingerprint collided with the server's")
	}

	err := handshake(t, Trust{Pins: []string{other}}, addr)
	cert, ok := Untrusted(err)
	if !ok {
		t.Fatalf("handshake error %v, want an untrusted certificate", err)
	}
	if Fingerprint(cert) != fp {
		t.Errorf("reported fingerprint %s, want the new certificate's %s", Fingerprint(cert), fp)
	}
}

func TestACustomCAIsTrusted(t *testing.T) {
	addr, _, caPEM := selfSigned(t)

	if err := handshake(t, Trust{CAPEM: caPEM}, addr); err != nil {
		t.Errorf("handshake with the CA: %v", err)
	}
}

// A certificate chaining to the custom CA is verified normally, so it still
// has to be for the host being connected to.
func TestACustomCAStillChecksTheHostname(t *testing.T) {
	addr, _, caPEM := selfSigned(t)
	cfg, err := Trust{CAPEM: caPEM}.TLSConfig("mail.example.org")
	if err != nil {
		t.Fatalf("TLSConfig: %v", err)
	}
	_, err = tls.Dial("tcp", addr, cfg)
	if _, ok := Untrusted(err); !ok {
		t.Errorf("handshake error %v, want an untrusted certificate for the wrong name", err)
	}
}

func TestAnInvalidCAIsRefused(t *testing.T) {
	if _, err := (Trust{CAPEM: "not a certificate"}).TLSConfig("127.0.0.1"); !errors.Is(err, ErrInvalidCA) {
		t.Errorf("TLSConfig() error = %v, want ErrInvalidCA", err)
	}
	if _, err := ParseCA("-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n"); !errors.Is(err, ErrInvalidCA) {
		t.Errorf("ParseCA(key) error = %v, want ErrInvalidCA", err)
	}
}

// The zero trust must be exactly the standard config: the default path for
// every ordinary mailbox is not to be touched.
func TestZeroTrustKeepsStandardVerification(t *testing.T) {
	cfg, err := Trust{}.TLSConfig("imap.example.org")
	if err != nil {
		t.Fatalf("TLSConfig: %v", err)
	}
	if cfg.InsecureSkipVerify || cfg.VerifyConnection != nil {
		t.Error("zero trust replaced the standard verification")
	}
	if cfg.ServerName != "imap.example.org" {
		t.Errorf("ServerName = %q, want the host", cfg.ServerName)
	}
}

func TestPinsRoundTrip(t *testing.T) {
	fp := strings.Repeat("0a", 32)
	pins := AddPin(nil, DisplayFingerprint(fp))
	pins = AddPin(pins, fp)
	if len(pins) != 1 || pins[0] != fp {
		t.Fatalf("AddPin() = %v, want one normalized pin", pins)
	}
	if got := ParsePins(FormatPins(pins) + "\n\n"); len(got) != 1 || got[0] != fp {
		t.Errorf("ParsePins(FormatPins()) = %v, want %v", got, pins)
	}
	if got := DisplayFingerprint(fp); !strings.HasPrefix(got, "0A:0A:") || len(got) != 95 {
		t.Errorf("DisplayFingerprint() = %q, want colon separated upper-case hex", got)
	}
}
