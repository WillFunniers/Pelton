package desktop

import (
	"context"
	"errors"
	"log/slog"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/peltonapp/Pelton/internal/crypto"
	"github.com/peltonapp/Pelton/internal/outbox"
	"github.com/peltonapp/Pelton/internal/smtp"
	"github.com/peltonapp/Pelton/internal/storage"
)

// scheduledTestApp is an app with a store and nothing else. The preview only
// reads the durable queue, so no account, keyring or network is involved.
func scheduledTestApp(t *testing.T) (*App, *storage.DB, context.Context) {
	t.Helper()
	ctx, stopBackground := testContext(t)
	db, err := storage.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	t.Cleanup(stopBackground)
	if err := db.RunMigrations(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return &App{ctx: ctx, store: db, queue: outbox.NewQueue(db), log: slog.New(slog.DiscardHandler)}, db, ctx
}

// queueScheduled puts a message through the real enqueue path, so the preview is
// tested against the mime the app actually freezes rather than one the test
// wrote to match its own expectations.
func queueScheduled(t *testing.T, db *storage.DB, ctx context.Context, msg *smtp.Message) int64 {
	t.Helper()
	accountID, err := db.CreateAccount(ctx, &storage.Account{Email: "me@example.com", DisplayName: "Me"})
	if err != nil {
		t.Fatalf("create account: %v", err)
	}
	id, err := smtp.Enqueue(ctx, outbox.NewQueue(db), accountID, msg, nil, crypto.ModeNone, crypto.Options{}, time.Now().UTC().Add(time.Hour))
	if err != nil {
		t.Fatalf("enqueue: %v", err)
	}
	return id
}

// insertRaw queues a message exactly as given, for the shapes the composer
// cannot produce on demand (an encrypted body, a signed body).
func insertRaw(t *testing.T, db *storage.DB, ctx context.Context, raw string) int64 {
	t.Helper()
	accountID, err := db.CreateAccount(ctx, &storage.Account{Email: "me@example.com", DisplayName: "Me"})
	if err != nil {
		t.Fatalf("create account: %v", err)
	}
	id, err := db.InsertOutbox(ctx, storage.OutboxRow{
		AccountID:     accountID,
		EnvelopeFrom:  "me@example.com",
		Recipients:    "you@example.com",
		Raw:           []byte(raw),
		State:         outbox.StateQueued,
		NextAttemptAt: time.Now().UTC().Add(time.Hour),
	})
	if err != nil {
		t.Fatalf("insert: %v", err)
	}
	return id
}

// The preview exists so a scheduled message can be checked before it leaves. It
// reads the frozen mime, so what it shows is what will be sent.
func TestScheduledPreviewReadsTheFrozenMessage(t *testing.T) {
	app, db, ctx := scheduledTestApp(t)

	inline := []byte("\x89PNG\r\n\x1a\ninline-image-bytes")
	file := []byte("a spreadsheet, allegedly")
	id := queueScheduled(t, db, ctx, &smtp.Message{
		From:    smtp.Address{Name: "Me", Email: "me@example.com"},
		To:      []smtp.Address{{Name: "You", Email: "you@example.com"}},
		Cc:      []smtp.Address{{Email: "cc@example.com"}},
		Bcc:     []smtp.Address{{Email: "secret@example.com"}},
		Subject: "项目报告",
		Text:    "the plain text of the report",
		HTML:    `<p>the report</p><script>alert(1)</script><img src="cid:chart@example.com">`,
		Attachments: []smtp.Attachment{
			{Filename: "chart.png", ContentType: "image/png", Content: inline, Inline: true, ContentID: "chart@example.com"},
			{Filename: "data.csv", ContentType: "text/csv", Content: file},
		},
	})

	dto, err := app.GetScheduledPreview(id)
	if err != nil {
		t.Fatalf("preview: %v", err)
	}

	if dto.Subject != "项目报告" {
		t.Errorf("subject = %q, want the frozen subject", dto.Subject)
	}
	if !strings.Contains(dto.To, "you@example.com") {
		t.Errorf("to = %q", dto.To)
	}
	if !strings.Contains(dto.Cc, "cc@example.com") {
		t.Errorf("cc = %q", dto.Cc)
	}
	if !strings.Contains(dto.Text, "the plain text of the report") {
		t.Errorf("text = %q", dto.Text)
	}
	// the body is rendered by the ui, so it has to come back sanitized: a
	// scheduled message is examined before anyone has decided to trust it.
	if !strings.Contains(dto.HTML, "the report") {
		t.Errorf("html lost the body: %q", dto.HTML)
	}
	if strings.Contains(dto.HTML, "<script>") {
		t.Errorf("html kept a script tag, so the sanitizer did not run: %q", dto.HTML)
	}
	// the inline image is not listed as a file: it belongs in the body.
	if len(dto.Attachments) != 1 || dto.Attachments[0].Filename != "data.csv" {
		t.Fatalf("attachments = %+v, want just data.csv", dto.Attachments)
	}
	if dto.Attachments[0].Size != int64(len(file)) {
		t.Errorf("attachment size = %d, want %d", dto.Attachments[0].Size, len(file))
	}
	// bcc never reaches the headers, so only the count can be reported.
	if dto.HiddenBccCount != 1 {
		t.Errorf("hiddenBccCount = %d, want 1", dto.HiddenBccCount)
	}
	if dto.ScheduledAt == "" {
		t.Error("scheduledAt is empty, so the ui cannot say when it goes out")
	}
	if dto.Protected {
		t.Error("a plain message was reported as protected")
	}
}

// A true inline image (Content-Disposition: inline) cannot be substituted into
// the body: rfc822.Parse reads those parts as body candidates, not attachments,
// so it yields no bytes and no content id for them. The reference is left as-is
// and the frame's CSP refuses it, rather than the preview reaching out for it.
//
// This is asserted rather than merely tolerated so that the limit is visible: if
// the parser ever starts surfacing inline parts, this test fails and the
// resolution path can be turned on deliberately.
func TestScheduledPreviewLeavesInlineCIDUnresolved(t *testing.T) {
	app, db, ctx := scheduledTestApp(t)

	id := queueScheduled(t, db, ctx, &smtp.Message{
		From:    smtp.Address{Email: "me@example.com"},
		To:      []smtp.Address{{Email: "you@example.com"}},
		Subject: "chart",
		Text:    "see the chart",
		HTML:    `<p>see the chart</p><img src="cid:chart@example.com">`,
		Attachments: []smtp.Attachment{
			{Filename: "chart.png", ContentType: "image/png", Content: []byte("IMGBYTES"), Inline: true, ContentID: "chart@example.com"},
		},
	})

	dto, err := app.GetScheduledPreview(id)
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	if !strings.Contains(dto.HTML, "cid:chart@example.com") {
		t.Errorf("html = %q, want the inline reference left for the CSP to refuse", dto.HTML)
	}
	if len(dto.Attachments) != 0 {
		t.Errorf("attachments = %+v, want none: the only part was the inline image", dto.Attachments)
	}
}

// A cancelled or already sent message has no preview, and the difference from an
// unreadable one has to be visible to the caller.
func TestScheduledPreviewMissingIsNotFound(t *testing.T) {
	app, _, _ := scheduledTestApp(t)

	if _, err := app.GetScheduledPreview(99); !errors.Is(err, storage.ErrOutboxNotFound) {
		t.Fatalf("preview(missing) = %v, want ErrOutboxNotFound", err)
	}
}

// An encrypted message has nothing readable in it, and rendering armor as though
// it were the message would be worse than saying so.
func TestScheduledPreviewHidesAnEncryptedBody(t *testing.T) {
	app, db, ctx := scheduledTestApp(t)

	const raw = "From: me@example.com\r\n" +
		"To: you@example.com\r\n" +
		"Subject: secrets\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: multipart/encrypted; protocol=\"application/pgp-encrypted\"; boundary=enc\r\n" +
		"\r\n" +
		"--enc\r\n" +
		"Content-Type: application/pgp-encrypted\r\n" +
		"\r\n" +
		"Version: 1\r\n" +
		"--enc\r\n" +
		"Content-Type: application/octet-stream\r\n" +
		"\r\n" +
		"-----BEGIN PGP MESSAGE-----\r\n" +
		"hQEMA0V4YW1wbGVPbkx5Q==\r\n" +
		"-----END PGP MESSAGE-----\r\n" +
		"--enc--\r\n"

	dto, err := app.GetScheduledPreview(insertRaw(t, db, ctx, raw))
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	if !dto.Protected {
		t.Fatal("an encrypted message was not reported as protected")
	}
	if dto.HTML != "" || dto.Text != "" {
		t.Errorf("an encrypted message produced a body: html=%q text=%q", dto.HTML, dto.Text)
	}
	// the ciphertext parts are not attachments the user chose to send.
	if len(dto.Attachments) != 0 {
		t.Errorf("attachments = %+v, want none for an encrypted body", dto.Attachments)
	}
	// the envelope is still readable, so the row can still be identified and
	// cancelled.
	if dto.Subject != "secrets" {
		t.Errorf("subject = %q, want the header subject", dto.Subject)
	}
}

// A message that is only signed is not encrypted: its text is in the clear and
// must still preview, or the feature would hide exactly the mail it can read.
func TestScheduledPreviewShowsASignedBody(t *testing.T) {
	app, db, ctx := scheduledTestApp(t)

	const raw = "From: me@example.com\r\n" +
		"To: you@example.com\r\n" +
		"Subject: signed\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: multipart/signed; protocol=\"application/pgp-signature\"; micalg=pgp-sha256; boundary=sig\r\n" +
		"\r\n" +
		"--sig\r\n" +
		"Content-Type: text/plain; charset=utf-8\r\n" +
		"\r\n" +
		"the readable body\r\n" +
		"--sig\r\n" +
		"Content-Type: application/pgp-signature\r\n" +
		"\r\n" +
		"-----BEGIN PGP SIGNATURE-----\r\n" +
		"abc\r\n" +
		"-----END PGP SIGNATURE-----\r\n" +
		"--sig--\r\n"

	dto, err := app.GetScheduledPreview(insertRaw(t, db, ctx, raw))
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	if dto.Protected {
		t.Fatal("a signed message was reported as encrypted, hiding a readable body")
	}
	if !strings.Contains(dto.Text, "the readable body") {
		t.Errorf("text = %q, want the signed body", dto.Text)
	}
}

// Cancelling is only possible while the message is still waiting. The worker
// claims a row by flipping it to sending inside the same transaction that
// selects it, so the database settles the race rather than either side holding a
// lock.
func TestCancelWorksWhileStillQueued(t *testing.T) {
	app, db, ctx := scheduledTestApp(t)
	id := queueScheduled(t, db, ctx, &smtp.Message{
		From:    smtp.Address{Email: "me@example.com"},
		To:      []smtp.Address{{Email: "you@example.com"}},
		Subject: "later",
		Text:    "body",
	})

	cancelled, err := app.CancelSend(id)
	if err != nil {
		t.Fatalf("cancel: %v", err)
	}
	if !cancelled {
		t.Fatal("a queued scheduled message could not be cancelled")
	}
	if _, err := app.GetScheduledPreview(id); !errors.Is(err, storage.ErrOutboxNotFound) {
		t.Fatalf("the cancelled message is still in the queue: %v", err)
	}
	if _, err := db.GetOutbox(ctx, id); !errors.Is(err, storage.ErrOutboxNotFound) {
		t.Fatalf("the cancelled row survived: %v", err)
	}
}

// Once the worker has claimed a message it is on its way, and cancelling must
// fail rather than silently pretend otherwise.
func TestCancelRefusesAMessageAlreadySending(t *testing.T) {
	app, db, ctx := scheduledTestApp(t)
	id := queueScheduled(t, db, ctx, &smtp.Message{
		From:    smtp.Address{Email: "me@example.com"},
		To:      []smtp.Address{{Email: "you@example.com"}},
		Subject: "now",
		Text:    "body",
	})

	// claim it the way the worker's transaction does.
	if err := db.UpdateOutboxState(ctx, id, outbox.StateSending, 0, "", time.Time{}); err != nil {
		t.Fatalf("claim: %v", err)
	}

	cancelled, err := app.CancelSend(id)
	if err != nil {
		t.Fatalf("cancel: %v", err)
	}
	if cancelled {
		t.Fatal("a message already being sent was cancelled")
	}
	if _, err := db.GetOutbox(ctx, id); err != nil {
		t.Fatalf("the refused cancel removed the row anyway: %v", err)
	}
}

// A display name containing a comma must not split into two addresses, or the
// second half would be counted as a hidden recipient that does not exist.
func TestHiddenBccCountKeepsDisplayNameCommasTogether(t *testing.T) {
	got := hiddenBccCount(
		"jane@example.com\nyou@example.com\ncc@example.com",
		`"Doe, Jane" <jane@example.com>, you@example.com`,
		"cc@example.com",
	)
	if got != 0 {
		t.Fatalf("hiddenBccCount = %d, want 0", got)
	}
}

// The count is what remains of the envelope once the named recipients are taken
// out, and a repeated envelope entry is one recipient rather than two.
func TestHiddenBccCountCountsOnlyTheUnnamed(t *testing.T) {
	got := hiddenBccCount(
		"you@example.com\ncc@example.com\nsecret@example.com\nsecret@example.com",
		"you@example.com",
		"cc@example.com",
	)
	if got != 1 {
		t.Fatalf("hiddenBccCount = %d, want 1", got)
	}
}

// An unreadable list under-reports rather than claiming hidden recipients that
// may not be there. Saying a message has bcc recipients it does not have is
// worse than saying nothing about them.
func TestHiddenBccCountUnderReportsOnBadHeaders(t *testing.T) {
	if got := hiddenBccCount("a@example.com\nb@example.com", "not an address list <<<", ""); got != 0 {
		t.Fatalf("hiddenBccCount = %d, want 0", got)
	}
}

// The list needs a subject without paying to decode attachments on every queue
// change, and an attachment count only for messages that are still waiting.
func TestListOutboxLabelsWaitingMessagesOnly(t *testing.T) {
	app, db, ctx := scheduledTestApp(t)

	waiting := queueScheduled(t, db, ctx, &smtp.Message{
		From:        smtp.Address{Email: "me@example.com"},
		To:          []smtp.Address{{Email: "you@example.com"}},
		Subject:     "later",
		Text:        "body",
		Attachments: []smtp.Attachment{{Filename: "a.txt", Content: []byte("hi")}},
	})

	sending := queueScheduled(t, db, ctx, &smtp.Message{
		From:    smtp.Address{Email: "me@example.com"},
		To:      []smtp.Address{{Email: "you@example.com"}},
		Subject: "now",
		Text:    "body",
	})
	if err := db.UpdateOutboxState(ctx, sending, outbox.StateSending, 0, "", time.Time{}); err != nil {
		t.Fatalf("claim: %v", err)
	}

	rows, err := app.ListOutbox()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	byID := map[int64]OutboxRowDTO{}
	for _, r := range rows {
		byID[r.ID] = r
	}

	if got := byID[waiting].Subject; got != "later" {
		t.Errorf("waiting subject = %q, want later", got)
	}
	if got := byID[waiting].AttachmentCount; got != 1 {
		t.Errorf("waiting attachmentCount = %d, want 1", got)
	}
	if got := byID[sending].Subject; got != "" {
		t.Errorf("a sending row was labelled %q, want no label", got)
	}
	if got := byID[sending].AttachmentCount; got != 0 {
		t.Errorf("a sending row reported %d attachments, want 0", got)
	}
}

// The engine stands aside on a.outboxPending (see newSyncEngine), so this is the
// exact predicate that decides whether a sync runs. A scheduled message waiting
// for its own moment must not trip it: sync holds the process-wide lock while it
// stands aside, so one "send later" used to stop every mailbox downloading until
// the schedule came round.
func TestOutboxPendingFollowsWhatIsReadyToSend(t *testing.T) {
	app, db, ctx := scheduledTestApp(t)

	acctID, err := db.CreateAccount(ctx, &storage.Account{Email: "me@example.com", DisplayName: "Me"})
	if err != nil {
		t.Fatalf("account: %v", err)
	}
	insert := func(state string, due time.Time) {
		t.Helper()
		if _, err := db.InsertOutbox(ctx, storage.OutboxRow{
			AccountID:     acctID,
			EnvelopeFrom:  "me@example.com",
			Recipients:    "you@example.com",
			Raw:           []byte("Subject: hi\r\n\r\nbody\r\n"),
			State:         state,
			NextAttemptAt: due,
		}); err != nil {
			t.Fatalf("insert %s: %v", state, err)
		}
	}

	// nothing queued yet
	if app.outboxPending() {
		t.Fatal("an empty outbox must not hold the sync back")
	}

	// a message scheduled for tomorrow: sync carries on
	insert("queued", time.Now().UTC().Add(24*time.Hour))
	if app.outboxPending() {
		t.Fatal("a message scheduled for later must not hold the sync back")
	}

	// its moment arrives
	insert("queued", time.Now().UTC().Add(-time.Minute))
	if !app.outboxPending() {
		t.Fatal("a due message must hold the sync back")
	}

	// the worker picks it up and is sending it right now
	insert("sending", time.Now().UTC().Add(24*time.Hour))
	if !app.outboxPending() {
		t.Fatal("a message being sent must hold the sync back")
	}
}
