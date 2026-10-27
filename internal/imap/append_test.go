package imap

import (
	"net"
	"strings"
	"testing"

	"github.com/emersion/go-imap/v2"
	"github.com/emersion/go-imap/v2/imapclient"
	"github.com/emersion/go-imap/v2/imapserver"
	"github.com/emersion/go-imap/v2/imapserver/imapmemserver"
)

// appendTestServer starts the real in-memory imap server with the folders a
// test needs already created, and returns a logged-in client.
//
// These are not mocks. The behaviour under test is "does the append land in the
// right folder and only once", and the folder resolution it depends on is real
// LIST output, so a hand-written protocol fake would be testing the fake.
func appendTestServer(t *testing.T, folders ...string) *Client {
	t.Helper()
	return appendTestServerWithCaps(t, nil, folders...)
}

// appendTestServerWithCaps is appendTestServer with control over what the server
// advertises, so the LIST-EXTENDED branch can be exercised both ways. A nil
// caps set is IMAP4rev1 only, which is the QQ case: no LIST-EXTENDED and no
// SPECIAL-USE, only the pre-standard XLIST.
func appendTestServerWithCaps(t *testing.T, caps imap.CapSet, folders ...string) *Client {
	t.Helper()

	mem := imapmemserver.New()
	user := imapmemserver.NewUser("user", "pass")
	for _, name := range folders {
		if err := user.Create(name, nil); err != nil {
			t.Fatalf("create %q: %v", name, err)
		}
	}
	mem.AddUser(user)

	srv := imapserver.New(&imapserver.Options{
		NewSession: func(*imapserver.Conn) (imapserver.Session, *imapserver.GreetingData, error) {
			return mem.NewSession(), nil, nil
		},
		Caps:         caps,
		InsecureAuth: true,
		Logger:       discardLogger{},
	})
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	go func() { _ = srv.Serve(ln) }()
	t.Cleanup(func() { _ = srv.Close() })

	conn, err := net.Dial("tcp", ln.Addr().String())
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	raw := imapclient.New(conn, nil)
	t.Cleanup(func() { _ = raw.Close() })
	if err := raw.Login("user", "pass").Wait(); err != nil {
		t.Fatalf("login: %v", err)
	}
	return &Client{raw: raw}
}

// sentMessage builds a minimal message carrying the given Message-ID.
func sentMessage(messageID string) []byte {
	return []byte("From: a@example.com\r\nTo: b@example.com\r\n" +
		"Subject: hi\r\nMessage-Id: <" + messageID + ">\r\n\r\nbody\r\n")
}

// QQ names its sent folder "Sent Messages", which is in no English default
// list. Appending has to find it by that name, or sent mail never shows up in
// Sent on QQ.
func TestAppendFindsSentMessagesFolder(t *testing.T) {
	c := appendTestServer(t, "INBOX", "Sent Messages", "Deleted Messages", "Drafts", "Junk")

	folder, wrote, err := c.AppendToSentUnlessPresent(sentMessage("fresh@example.com"))
	if err != nil {
		t.Fatalf("append: %v", err)
	}
	if folder != "Sent Messages" {
		t.Errorf("folder = %q, want %q", folder, "Sent Messages")
	}
	if !wrote {
		t.Error("wrote = false, want true: the message was not in Sent yet")
	}
}

// A message already in Sent must not be appended again. QQ saves its own copy
// when its "save a copy after sending" option is on, and appending on top of
// that leaves two identical messages in the folder.
func TestAppendSkipsMessageAlreadyInSent(t *testing.T) {
	c := appendTestServer(t, "INBOX", "Sent Messages")

	raw := sentMessage("dup@example.com")
	seed := c.raw.Append("Sent Messages", int64(len(raw)), nil)
	if _, err := seed.Write(raw); err != nil {
		t.Fatalf("seed append write: %v", err)
	}
	if err := seed.Close(); err != nil {
		t.Fatalf("seed append close: %v", err)
	}
	if _, err := seed.Wait(); err != nil {
		t.Fatalf("seed append wait: %v", err)
	}

	folder, wrote, err := c.AppendToSentUnlessPresent(raw)
	if err != nil {
		t.Fatalf("append: %v", err)
	}
	if folder != "Sent Messages" {
		t.Errorf("folder = %q, want %q", folder, "Sent Messages")
	}
	if wrote {
		t.Error("wrote = true, want false: the message was already in Sent")
	}
}

// append reports the uid the server gave the new copy, which ReplaceDraft
// needs to remove the draft it just replaced; 0 means the server said nothing.
// A refused append is an error and no uid, so a caller cannot mistake a failed
// upload for a stored one.
func TestAppendReturnsTheStoredCopyUID(t *testing.T) {
	c := appendTestServer(t, "INBOX", "Sent Messages")

	first, err := c.append("Sent Messages", sentMessage("first@example.com"))
	if err != nil {
		t.Fatalf("append: %v", err)
	}
	if first == 0 {
		t.Fatal("uid = 0, want the uid of the stored copy")
	}
	second, err := c.append("Sent Messages", sentMessage("second@example.com"))
	if err != nil {
		t.Fatalf("append: %v", err)
	}
	if second <= first {
		t.Errorf("second uid = %v, want it above %v", second, first)
	}

	bad, err := c.append("NoSuchFolder", sentMessage("bad@example.com"))
	if err == nil {
		t.Fatal("append to a missing mailbox succeeded")
	}
	if bad != 0 {
		t.Errorf("uid = %v on a refused append, want 0", bad)
	}
}

// A message with no Message-ID cannot be matched against what is already in
// Sent, so it is appended rather than skipped: a duplicate copy is the failure
// the user can see and delete, a silently dropped one is not.
func TestAppendToSentKeepsCopyWithoutMessageID(t *testing.T) {
	c := appendTestServer(t, "INBOX", "Sent Messages")
	raw := []byte("From: a@example.com\r\nTo: b@example.com\r\nSubject: no id\r\n\r\nbody\r\n")

	folder, wrote, err := c.AppendToSentUnlessPresent(raw)
	if err != nil {
		t.Fatalf("append: %v", err)
	}
	if folder != "Sent Messages" {
		t.Errorf("folder = %q, want %q", folder, "Sent Messages")
	}
	if !wrote {
		t.Error("wrote = false, want true: a message without a Message-ID cannot be deduplicated")
	}
}

// Sending the same message again, with the server's own copy already in Sent,
// leaves exactly one copy there however many times the appender runs.
func TestAppendToSentLeavesOneCopyOfARepeatedSend(t *testing.T) {
	c := appendTestServer(t, "INBOX", "Sent Messages")
	raw := sentMessage("repeat@example.com")

	seed, err := c.append("Sent Messages", raw)
	if err != nil {
		t.Fatalf("seed append: %v", err)
	}
	if seed == 0 {
		t.Fatal("seed uid = 0")
	}
	for i := 0; i < 2; i++ {
		_, wrote, err := c.AppendToSentUnlessPresent(raw)
		if err != nil {
			t.Fatalf("append %d: %v", i, err)
		}
		if wrote {
			t.Fatalf("append %d wrote a second copy", i)
		}
	}

	mbox, err := c.Select("Sent Messages")
	if err != nil {
		t.Fatalf("select: %v", err)
	}
	if mbox.NumMessages != 1 {
		t.Errorf("Sent holds %d messages, want 1", mbox.NumMessages)
	}
}

// With no Sent folder at all the caller gets ErrSpecialFolderNotFound rather
// than a wrong folder being picked. The send path treats this as non-fatal.
func TestAppendReportsMissingSentFolder(t *testing.T) {
	c := appendTestServer(t, "INBOX", "Notes")

	_, _, err := c.AppendToSentUnlessPresent(sentMessage("x@example.com"))
	if err == nil {
		t.Fatal("append succeeded with no Sent folder present")
	}
	if !strings.Contains(err.Error(), "special-use folder not found") {
		t.Errorf("err = %v, want it to report the missing folder", err)
	}
}

// The Chinese folder names matter for accounts whose server reports them that
// way, so the fallback list has to cover them.
func TestSentFolderNamesCoverChineseProviders(t *testing.T) {
	for _, want := range []string{"Sent Messages", "已发送", "已发送邮件"} {
		if !contains(sentFolderNames, want) {
			t.Errorf("sentFolderNames does not cover %q", want)
		}
	}
}

// A server that advertises no LIST-EXTENDED must be sent a plain LIST: QQ
// answers an unknown command with a tagless response and then drops the
// connection, so asking for RETURN (SPECIAL-USE) there would break the sync.
func TestListFoldersAvoidsExtendedSyntaxWithoutCapability(t *testing.T) {
	c := appendTestServerWithCaps(t, imap.CapSet{imap.CapIMAP4rev1: {}},
		"INBOX", "Sent Messages", "Deleted Messages")

	folders, err := c.ListFolders()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if !hasFolder(folders, "Sent Messages") {
		t.Errorf("folders = %v, want it to include QQ's Sent Messages", folderNames(folders))
	}
}

// With LIST-EXTENDED the request is made, and the folders still come back.
func TestListFoldersUsesExtendedSyntaxWithCapability(t *testing.T) {
	caps := imap.CapSet{imap.CapIMAP4rev1: {}, imap.CapListExtended: {}}
	c := appendTestServerWithCaps(t, caps, "INBOX", "Sent Messages")

	folders, err := c.ListFolders()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if !hasFolder(folders, "Sent Messages") {
		t.Errorf("folders = %v, want it to include Sent Messages", folderNames(folders))
	}
}

func hasFolder(folders []Folder, name string) bool {
	for _, f := range folders {
		if f.Name == name {
			return true
		}
	}
	return false
}

func folderNames(folders []Folder) []string {
	out := make([]string, 0, len(folders))
	for _, f := range folders {
		out = append(out, f.Name)
	}
	return out
}

func contains(list []string, want string) bool {
	for _, s := range list {
		if s == want {
			return true
		}
	}
	return false
}
