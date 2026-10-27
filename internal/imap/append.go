package imap

import (
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/emersion/go-imap/v2"

	"github.com/peltonapp/Pelton/internal/rfc822"
)

// ErrSpecialFolderNotFound means neither the special-use attribute nor any known
// fallback name located the requested folder. Callers treat appending to Sent as
// non-fatal, so this is surfaced as a warning rather than failing a send.
var ErrSpecialFolderNotFound = errors.New("imap: special-use folder not found")

// Fallback folder names by which servers commonly expose Sent and Drafts when
// they do not advertise the RFC 6154 special-use attribute.
//
// The list is deliberately ordered the way a server names its folders, and it
// covers the Chinese providers because none of them use the English default:
// QQ and Foxmail call Sent "Sent Messages" and Trash "Deleted Messages", and
// 163/126/yeah.net expose the same names. Attribute matching finds these on a
// server that answers SPECIAL-USE, but QQ advertises XLIST instead, so the name
// fallback is what actually resolves it there.
var (
	sentFolderNames = []string{
		"Sent", "Sent Items", "Sent Mail", "Sent Messages", "Gesendet",
		"已发送", "已发送邮件",
	}
	draftFolderNames = []string{
		"Drafts", "Draft", "Entwürfe", "草稿箱", "草稿",
	}
)

// AppendToSent appends raw to the Sent folder with \Seen, since a message the
// user just sent is already read. It locates Sent by the \Sent special-use
// attribute, falling back to common names. Returns the folder used.
func (c *Client) AppendToSent(raw []byte) (string, error) {
	return c.appendSpecial(imap.MailboxAttrSent, sentFolderNames, raw, imap.FlagSeen)
}

// AppendToSentUnlessPresent appends raw to Sent only when the message is not
// already there, and reports the folder it used together with whether it
// actually wrote anything.
//
// This exists because several providers save a copy server-side on their own:
// QQ has a "save a copy after sending with SMTP" account option, and when it is
// on the message is in Sent before we ever append. Appending anyway leaves the
// user with two identical copies of every message they send, which is worse
// than the empty Sent this is fixing. The Message-ID header is the right key
// because every message carries a unique one and it survives the round trip.
//
// A search failure is not treated as "not present": it returns the error, and
// the caller decides. Guessing would either duplicate mail or silently drop the
// only copy, and neither is a good default.
func (c *Client) AppendToSentUnlessPresent(raw []byte) (string, bool, error) {
	mailbox, err := c.findSpecialFolder(imap.MailboxAttrSent, sentFolderNames)
	if err != nil {
		return "", false, err
	}

	messageID := messageIDOf(raw)
	if messageID != "" {
		present, err := c.sentHoldsMessage(mailbox, messageID)
		if err != nil {
			return mailbox, false, err
		}
		if present {
			return mailbox, false, nil
		}
	}

	// the uid of the new copy is only needed by ReplaceDraft, which removes an
	// earlier draft it just replaced; a sent message is complete once stored.
	if _, err := c.append(mailbox, raw, imap.FlagSeen); err != nil {
		return mailbox, false, err
	}
	return mailbox, true, nil
}

// sentHoldsMessage selects mailbox and reports whether it already holds a
// message with the given Message-ID.
//
// It goes through Select rather than raw.Select so the client's own record of
// the open mailbox is updated: SearchByMessageID refuses to run without one,
// and searching the wrong mailbox would be worse than not searching at all.
func (c *Client) sentHoldsMessage(mailbox, messageID string) (bool, error) {
	if _, err := c.Select(mailbox); err != nil {
		return false, fmt.Errorf("imap: select %q for duplicate check: %w", mailbox, err)
	}
	uids, err := c.SearchByMessageID(messageID)
	if err != nil {
		return false, err
	}
	return len(uids) > 0, nil
}

// messageIDOf reads the Message-ID header out of a raw message, or "" when the
// message has none or cannot be parsed. A message without one cannot be
// deduplicated, so the caller appends rather than skipping.
func messageIDOf(raw []byte) string {
	msg, err := rfc822.Parse(raw)
	if err != nil {
		return ""
	}
	return msg.MessageID
}

// AppendToDrafts appends raw to the Drafts folder with the \Draft flag. It
// locates Drafts by the \Drafts special-use attribute, falling back to common
// names. Returns the folder used. It never removes an earlier copy;
// ReplaceDraft does.
func (c *Client) AppendToDrafts(raw []byte) (string, error) {
	return c.appendSpecial(imap.MailboxAttrDrafts, draftFolderNames, raw, imap.FlagDraft)
}

// ReplaceDraft stores raw in mailbox with the \Draft flag and removes
// every earlier copy carrying the same Message-ID, so saving one draft again
// and again leaves a single copy. The new copy goes in before the old ones are
// removed: a failure part way through leaves a duplicate, never no draft at
// all. When the append yields no copy distinct from the earlier ones, as on
// Gmail, which keeps one message per Message-ID, nothing is removed.
func (c *Client) ReplaceDraft(mailbox string, raw []byte, messageID string) error {
	earlier, err := c.findDraft(mailbox, messageID)
	if err != nil {
		return err
	}
	stored, err := c.append(mailbox, raw, imap.FlagDraft)
	if err != nil {
		return err
	}
	if stored == 0 {
		// no APPENDUID: look for the new copy among the ones there now.
		after, err := c.findDraft(mailbox, messageID)
		if err != nil {
			return err
		}
		if i := slices.IndexFunc(after, func(uid imap.UID) bool { return !slices.Contains(earlier, uid) }); i >= 0 {
			stored = after[i]
		}
	}
	if stored == 0 || slices.Contains(earlier, stored) {
		return nil
	}
	return c.DeleteMessages(earlier...)
}

// RemoveDraft deletes every copy of the draft with the given Message-ID from
// mailbox. No copy there is not an error.
func (c *Client) RemoveDraft(mailbox, messageID string) error {
	uids, err := c.findDraft(mailbox, messageID)
	if err != nil {
		return err
	}
	return c.DeleteMessages(uids...)
}

// findDraft selects mailbox and returns the uids of the copies of one draft
// it holds. An empty messageID matches nothing, not every message that lacks
// a Message-ID.
func (c *Client) findDraft(mailbox, messageID string) ([]imap.UID, error) {
	id := strings.Trim(strings.TrimSpace(messageID), "<>")
	if id == "" {
		return nil, nil
	}
	if _, err := c.Select(mailbox); err != nil {
		return nil, err
	}
	return c.uidsWithMessageID(id)
}

// uidsWithMessageID returns the uids in the selected mailbox whose Message-ID,
// without angle brackets, is id. It reads the envelopes rather than using
// SEARCH HEADER, which on Stalwart finds nothing. A Drafts folder is small
// enough for that.
func (c *Client) uidsWithMessageID(id string) ([]imap.UID, error) {
	mbox := c.selectedMailbox()
	if mbox == nil || mbox.NumMessages == 0 {
		return nil, nil
	}
	var all imap.SeqSet
	all.AddRange(1, mbox.NumMessages)
	buffers, err := c.raw.Fetch(all, &imap.FetchOptions{Envelope: true, UID: true}).Collect()
	if err != nil {
		return nil, fmt.Errorf("imap: fetch envelopes: %w", err)
	}
	var uids []imap.UID
	for _, b := range buffers {
		if b.Envelope != nil && b.Envelope.MessageID == id {
			uids = append(uids, b.UID)
		}
	}
	return uids, nil
}

// appendSpecial resolves a special-use folder then appends raw with the flags.
func (c *Client) appendSpecial(attr imap.MailboxAttr, fallbacks []string, raw []byte, flags ...imap.Flag) (string, error) {
	mailbox, err := c.findSpecialFolder(attr, fallbacks)
	if err != nil {
		return "", err
	}
	if _, err := c.append(mailbox, raw, flags...); err != nil {
		return "", err
	}
	return mailbox, nil
}

// append uploads a message into a mailbox with the given flags via APPEND and
// returns the uid the server reports for it, or 0 when it reports none, as a
// server without UIDPLUS does.
func (c *Client) append(mailbox string, raw []byte, flags ...imap.Flag) (imap.UID, error) {
	options := &imap.AppendOptions{Flags: flags}
	cmd := c.raw.Append(mailbox, int64(len(raw)), options)
	if _, err := cmd.Write(raw); err != nil {
		_ = cmd.Close()
		return 0, fmt.Errorf("imap: append write to %q: %w", mailbox, err)
	}
	if err := cmd.Close(); err != nil {
		return 0, fmt.Errorf("imap: append close to %q: %w", mailbox, err)
	}
	data, err := cmd.Wait()
	if err != nil {
		return 0, fmt.Errorf("imap: append to %q: %w", mailbox, err)
	}
	return data.UID, nil
}

// findSpecialFolder returns the mailbox matching the special-use attribute, or
// the first matching fallback name, or ErrSpecialFolderNotFound.
//
// gmail diverges here: its folders are label views, but it does advertise
// \Sent and \Drafts special-use on the corresponding labels, so attribute
// matching works without special casing.
func (c *Client) findSpecialFolder(attr imap.MailboxAttr, fallbacks []string) (string, error) {
	folders, err := c.ListFolders()
	if err != nil {
		return "", err
	}

	for _, f := range folders {
		if f.HasAttr(attr) {
			return f.Name, nil
		}
	}
	for _, name := range fallbacks {
		for _, f := range folders {
			if strings.EqualFold(f.Name, name) {
				return f.Name, nil
			}
		}
	}
	return "", fmt.Errorf("%w: attr %q", ErrSpecialFolderNotFound, attr)
}
