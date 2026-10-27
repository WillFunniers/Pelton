package phishing

import "testing"

// The bug: a user whose own mailbox sits on a domain that resembles one they
// write to had their own mail accused of imitating that contact. The pair only
// has to differ by the suffix, which is the shape of an organisation that owns
// its name under more than one tld, and a copy the user sends to themselves
// lands in the inbox and gets checked like anything else.
//
// A warning on the user's own mail is the worst kind of false positive: it is
// unarguable to the person reading it, and it teaches them the banner is noise.
func TestAuthenticatedMailFromYourOwnMailboxIsNotImpersonation(t *testing.T) {
	msg := Message{
		From:     "me@example.de",
		FromName: "Example Shop",
		Auth: Auth{
			SPF: "pass", SPFDomain: "example.de",
			DKIM: "pass", DKIMDomain: "example.de",
			DMARC: "pass",
		},
		Correspondents: map[string]string{"contact@example.com": "Example Shop"},
		Own:            []string{"me@example.de"},
	}

	report := Analyse(msg)
	if hasKind(report, KindLookalikeDomain) {
		t.Error("the user's own authenticated mail was reported as a lookalike domain")
	}
	if hasKind(report, KindDisplayNameSpoof) {
		t.Error("the user's own authenticated mail was reported as a display-name spoof")
	}
	if report.Level != LevelNone {
		t.Errorf("level = %q, want %q", report.Level, LevelNone)
	}
}

// The exemption is not the From line's to claim. Mail that says it is from you
// is a phishing shape in its own right, so without authentication backing it
// the checks have to run as they always did.
func TestUnauthenticatedMailClaimingToBeYouIsStillChecked(t *testing.T) {
	base := Message{
		From:           "me@example.de",
		Correspondents: map[string]string{"contact@example.com": "Example Shop"},
		Own:            []string{"me@example.de"},
	}

	for _, tt := range []struct {
		name string
		auth Auth
	}{
		{"nothing stated", Auth{}},
		{"authentication failed", Auth{SPF: "fail", SPFDomain: "example.de", DMARC: "fail"}},
		{"passed for somebody else's domain", Auth{SPF: "pass", SPFDomain: "elsewhere.test"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			msg := base
			msg.Auth = tt.auth
			if !hasKind(Analyse(msg), KindLookalikeDomain) {
				t.Error("an unvouched-for claim to be the user was let through the lookalike check")
			}
		})
	}
}

// The exemption belongs to the address that actually holds it: another mailbox
// on the same domain is not one of the user's own.
func TestTheExemptionIsPerAddress(t *testing.T) {
	msg := Message{
		From:           "someone-else@example.de",
		Auth:           Auth{SPF: "pass", SPFDomain: "example.de", DKIM: "pass", DKIMDomain: "example.de", DMARC: "pass"},
		Correspondents: map[string]string{"contact@example.com": "Example Shop"},
		Own:            []string{"me@example.de"},
	}

	if !hasKind(Analyse(msg), KindLookalikeDomain) {
		t.Error("a different mailbox on the same domain was treated as the user's own")
	}
}

// An install with no accounts recorded, and mail from anyone else, must behave
// exactly as before.
func TestNoOwnAddressesChangesNothing(t *testing.T) {
	msg := Message{
		From:           "me@example.de",
		Auth:           Auth{SPF: "pass", SPFDomain: "example.de", DKIM: "pass", DKIMDomain: "example.de", DMARC: "pass"},
		Correspondents: map[string]string{"contact@example.com": "Example Shop"},
	}

	if !hasKind(Analyse(msg), KindLookalikeDomain) {
		t.Error("the lookalike check went quiet with no own addresses to go on")
	}
}

// The exemption covers who the message claims to be from, and nothing else: a
// link check has no opinion about the sender's identity.
func TestOwnSenderStillHasItsLinksChecked(t *testing.T) {
	msg := Message{
		From: "me@example.de",
		Auth: Auth{SPF: "pass", SPFDomain: "example.de", DKIM: "pass", DKIMDomain: "example.de", DMARC: "pass"},
		HTML: `<a href="https://elsewhere.test/login">https://example.de/account</a>`,
		Own:  []string{"me@example.de"},
	}

	if len(Analyse(msg).Signals) == 0 {
		t.Error("exempting the sender also silenced the link checks")
	}
}

func TestOwnSenderMatchIsCaseInsensitive(t *testing.T) {
	msg := Message{
		From:           "Me@Example.DE",
		Auth:           Auth{SPF: "pass", SPFDomain: "example.de", DKIM: "pass", DKIMDomain: "example.de", DMARC: "pass"},
		Correspondents: map[string]string{"contact@example.com": "Example Shop"},
		Own:            []string{"me@example.de"},
	}

	if hasKind(Analyse(msg), KindLookalikeDomain) {
		t.Error("the user's own address was not recognised in a different case")
	}
}
