// Cipher compatibility for mail hosts that never learned ECDHE.
//
// crypto/tls removed RSA key exchange from its default suite list, because a
// session key wrapped with the server's RSA key has no forward secrecy. A
// server that offers nothing else therefore cannot complete a handshake with a
// default Go client at all: it answers the ClientHello with a fatal
// handshake_failure alert, which surfaces as
//
//	imap: dial imap.139.com:993: remote error: tls: handshake failure
//
// 139 Mail's IMAP service is that kind of server. Measured on 2026-09-28, one
// suite at a time: of the 25 suites Go can be told to offer, the four RSA ones
// complete and all twenty-one ECDHE ones fail. OpenSSL and Python connect
// happily because both still offer RSA key exchange by default, which is why
// the host looks reachable from a shell and unreachable from here.
//
// Two things keep this from being a blanket weakening of every connection:
//
//   - the suites are added only for the hosts in legacyRSAHosts, so no other
//     server is ever offered them;
//   - only the two AEAD (GCM) suites are added. The server also accepts the CBC
//     ones, and they are deliberately left out: a CBC suite brings the padding
//     oracle that comes with it, and there is nothing to gain by offering it
//     when GCM works.
//
// They are appended rather than substituted, so a host that can do ECDHE still
// negotiates ECDHE: Go picks the first mutually supported suite from the
// client's own order when it is the client that chooses.

package certtrust

import (
	"crypto/tls"
	"strings"
)

// legacyRSAHosts are the mail hosts measured to complete a handshake only with
// RSA key exchange. The 10086.cn names resolve to the same servers as the
// 139.com ones (they are aliases of imap.mail.10086.cn and smtp.mail.10086.cn),
// so a mailbox configured with either spelling works. SMTP on this service
// negotiates TLS 1.3 and does not need the suites; it is listed anyway so a
// configuration that falls back to TLS 1.2 there does not turn into the same
// dead end.
var legacyRSAHosts = map[string]bool{
	"imap.139.com":  true,
	"imap.10086.cn": true,
	"smtp.139.com":  true,
	"smtp.10086.cn": true,
}

// withLegacyCiphers returns a config that also offers the two AEAD RSA
// key-exchange suites when serverName is one of the hosts that need them. Every
// other host is returned unchanged, defaults included.
func withLegacyCiphers(cfg *tls.Config, serverName string) *tls.Config {
	if !legacyRSAHosts[strings.ToLower(strings.TrimSpace(serverName))] {
		return cfg
	}
	// An empty CipherSuites means "use the defaults"; a populated one means
	// "use exactly these". So the defaults have to be spelled out, not appended
	// to an empty slice, or the host would lose every ECDHE suite it can use.
	suites := make([]uint16, 0, len(tls.CipherSuites())+2)
	for _, cs := range tls.CipherSuites() {
		suites = append(suites, cs.ID)
	}
	suites = append(suites,
		tls.TLS_RSA_WITH_AES_128_GCM_SHA256,
		tls.TLS_RSA_WITH_AES_256_GCM_SHA384,
	)
	cfg.CipherSuites = suites
	return cfg
}
