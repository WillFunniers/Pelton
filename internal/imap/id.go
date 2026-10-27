package imap

import (
	"fmt"
	"runtime"

	"github.com/emersion/go-imap/v2"
)

// idClientName and idVendor identify this client in the ID command. RFC 2971
// asks a client to name itself; servers use it for their own statistics, and
// some log it with support requests. It deliberately carries nothing about the
// account, the user or the messages, and no identifier that could be used to
// follow a person between servers.
const (
	idClientName = "Pelton"
	idVendor     = "Pelton"
)

// SendID announces this client to the server with the IMAP ID command
// (RFC 2971), if the server advertises the capability.
//
// This is not cosmetic. NetEase's servers (163.com, 126.com, yeah.net) refuse
// to let a client select a mailbox unless it has sent ID, answering SELECT with
// "Unsafe Login. Please contact kefu@188.com for help". Login succeeds, so the
// failure surfaces later as a sync that cannot select anything rather than as a
// rejected password, which is a confusing way to fail. RFC 2971 section 3 says
// a server must not refuse service because of what ID contains, so NetEase is
// out of line, but the workaround is one command and every other client sends
// it too.
//
// QQ advertises ID but does not require it. It is sent there anyway, because
// announcing the client costs nothing and some servers behave better when they
// know what is talking to them.
//
// A server without the capability is not an error: the command would be
// rejected as unknown, and QQ's answer to an unknown command is a malformed
// untagged response that leaves the connection unusable (it replies "* BAD
// Command!" without a tag, and RFC 3501 requires a tag on a command response).
// So the capability is checked first, which is also why this never probes by
// sending the command and seeing what happens.
func (c *Client) SendID() error {
	if !c.raw.Caps().Has(imap.CapID) {
		return nil
	}
	data := &imap.IDData{
		Name:    idClientName,
		Version: idVersion,
		Vendor:  idVendor,
		OS:      runtime.GOOS,
	}
	if _, err := c.raw.ID(data).Wait(); err != nil {
		return fmt.Errorf("imap: send ID: %w", err)
	}
	return nil
}

// idVersion is reported in the ID command. It is a constant rather than the
// build's own version so that the imap package does not have to be told what
// the app version is; the point of the field is to name a protocol client, not
// to identify a release.
const idVersion = "1.0"
