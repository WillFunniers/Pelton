package imap

import (
	"crypto/tls"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/emersion/go-imap/v2/imapserver"
	"github.com/emersion/go-imap/v2/imapserver/imapmemserver"

	"github.com/peltonapp/Pelton/internal/certtrust"
)

// selfSignedIMAP starts an imap server with httptest's self-signed certificate,
// the shape of Proton Mail Bridge. implicit picks TLS from the first byte
// rather than STARTTLS. It returns the port and the certificate's fingerprint.
func selfSignedIMAP(t *testing.T, implicit bool) (int, string) {
	t.Helper()
	certServer := httptest.NewTLSServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	certServer.Close()
	// httptest offers only http/1.1 over ALPN, which an imap client asking for
	// "imap" is refused; a mail server offers nothing.
	tlsConfig := certServer.TLS.Clone()
	tlsConfig.NextProtos = nil

	mem := imapmemserver.New()
	srv := imapserver.New(&imapserver.Options{
		NewSession: func(*imapserver.Conn) (imapserver.Session, *imapserver.GreetingData, error) {
			return mem.NewSession(), nil, nil
		},
		TLSConfig: tlsConfig,
		Logger:    discardLogger{},
	})
	var ln net.Listener
	var err error
	if implicit {
		ln, err = tls.Listen("tcp", "127.0.0.1:0", tlsConfig)
	} else {
		ln, err = net.Listen("tcp", "127.0.0.1:0")
	}
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	go func() { _ = srv.Serve(ln) }()
	t.Cleanup(func() { _ = srv.Close() })

	_, port, _ := net.SplitHostPort(ln.Addr().String())
	n, _ := strconv.Atoi(port)
	return n, certtrust.Fingerprint(certServer.Certificate())
}

// Both transports have to surface an untrusted certificate the same way, and
// accept it once pinned: Proton Bridge uses STARTTLS, most self-hosted servers
// implicit TLS (#446).
func TestCheckTLSReportsAndThenAcceptsAPinnedCertificate(t *testing.T) {
	for _, tt := range []struct {
		name     string
		implicit bool
		mode     TLSMode
	}{
		{"implicit tls", true, TLSImplicit},
		{"starttls", false, TLSStartTLS},
	} {
		t.Run(tt.name, func(t *testing.T) {
			port, fp := selfSignedIMAP(t, tt.implicit)
			cfg := Config{Host: "127.0.0.1", Port: port, TLS: tt.mode}

			err := CheckTLS(cfg)
			cert, ok := certtrust.Untrusted(err)
			if !ok {
				t.Fatalf("CheckTLS() error = %v, want an untrusted certificate", err)
			}
			if certtrust.Fingerprint(cert) != fp {
				t.Errorf("reported fingerprint %s, want %s", certtrust.Fingerprint(cert), fp)
			}

			cfg.Trust = certtrust.Trust{Pins: []string{fp}}
			if err := CheckTLS(cfg); err != nil {
				t.Errorf("CheckTLS() with the pin: %v", err)
			}
		})
	}
}

// CheckTLS exists to look at a certificate before anything is stored, so it
// must not insist on credentials the way Connect does.
func TestCheckTLSNeedsNoCredentials(t *testing.T) {
	if _, err := Connect(Config{Host: "127.0.0.1", Port: 1}); err == nil {
		t.Fatal("Connect() without credentials returned no error")
	}
	port, fp := selfSignedIMAP(t, true)
	if err := CheckTLS(Config{Host: "127.0.0.1", Port: port, TLS: TLSImplicit, Trust: certtrust.Trust{Pins: []string{fp}}}); err != nil {
		t.Errorf("CheckTLS() without credentials: %v", err)
	}
}
