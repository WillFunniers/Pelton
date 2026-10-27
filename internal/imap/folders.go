package imap

import (
	"fmt"
	"slices"

	"github.com/emersion/go-imap/v2"
)

const (
	listReference  = ""  // root of the personal namespace
	listAllPattern = "*" // recurse all levels ("%" is top level only)
)

// Folder is one mailbox in the account hierarchy.
type Folder struct {
	Name string
	// Delimiter is the hierarchy separator; varies by provider ("/", "."), 0 if
	// flat. Never assume "/" when splitting paths.
	Delimiter rune
	Attrs     []imap.MailboxAttr
}

// Selectable reports whether the folder can hold messages and be selected.
func (f Folder) Selectable() bool {
	return !f.HasAttr(imap.MailboxAttrNoSelect) && !f.HasAttr(imap.MailboxAttrNonExistent)
}

// HasAttr reports whether the folder carries the given attribute.
func (f Folder) HasAttr(attr imap.MailboxAttr) bool {
	return slices.Contains(f.Attrs, attr)
}

// ListFolders returns every mailbox, including non-selectable containers.
//
// The requested options depend on what the server advertises, because the two
// extensions are not the same thing:
//
//   - LIST-EXTENDED lets the client ask for attributes with RETURN (SPECIAL-USE).
//   - SPECIAL-USE (RFC 6154) means the server attaches \Sent, \Drafts and the
//     rest on its own, with no extended syntax needed.
//
// QQ advertises neither (it has XLIST, a pre-standard Gmail extension), so it
// must be sent the plain LIST it understands. That is safe because the folder
// names are then matched by name, which is what the fallback list is for. 163
// advertises SPECIAL-USE but not LIST-EXTENDED, so a bare LIST is what returns
// its attributes. Gmail, iCloud and Outlook have LIST-EXTENDED and get the
// explicit request.
//
// Sending RETURN to a server that does not implement it is not a harmless
// no-op: QQ answers an unknown command with a tagless "* BAD Command!" and RFC
// 3501 requires a tag, so a client waiting for one hangs until the server drops
// the connection. Checking the capability first is what avoids that.
func (c *Client) ListFolders() ([]Folder, error) {
	options := c.listOptions()

	folders, err := c.listFoldersWith(options)
	if err != nil && options != nil {
		// A server that advertises LIST-EXTENDED but mishandles the request
		// still gets a working sync from the plain form.
		folders, err = c.listFoldersWith(nil)
	}
	if err != nil {
		return nil, fmt.Errorf("imap: list folders: %w", err)
	}
	return folders, nil
}

// listOptions picks the LIST options this server actually supports.
func (c *Client) listOptions() *imap.ListOptions {
	if c.raw.Caps().Has(imap.CapListExtended) {
		return &imap.ListOptions{ReturnSpecialUse: true}
	}
	return nil
}

// listFoldersWith runs one LIST and maps it to Folders.
func (c *Client) listFoldersWith(options *imap.ListOptions) ([]Folder, error) {
	data, err := c.raw.List(listReference, listAllPattern, options).Collect()
	if err != nil {
		return nil, err
	}

	folders := make([]Folder, 0, len(data))
	for _, d := range data {
		folders = append(folders, Folder{
			Name:      d.Mailbox,
			Delimiter: d.Delim,
			Attrs:     d.Attrs,
		})
	}
	return folders, nil
}
