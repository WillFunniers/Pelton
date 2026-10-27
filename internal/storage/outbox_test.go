package storage

import (
	"bytes"
	"context"
	"errors"
	"testing"
	"time"
)

// a preview asks for one queued message by id, so an id that is not there has to
// be distinguishable from a row that happens to be empty. Without that the ui
// cannot tell "already sent and pruned" from "something went wrong".
func TestGetOutboxMissingIsNotFound(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()

	if _, err := db.GetOutbox(ctx, 4242); !errors.Is(err, ErrOutboxNotFound) {
		t.Fatalf("GetOutbox(missing) = %v, want ErrOutboxNotFound", err)
	}
}

// the preview parses raw_message, so the bytes have to come back exactly as they
// went in, alongside the envelope and the time the message is held until.
func TestGetOutboxRoundTripsRawMessage(t *testing.T) {
	db := newTestDB(t)
	ctx := context.Background()

	acct, err := db.EnsureLocalAccount(ctx)
	if err != nil {
		t.Fatalf("local account: %v", err)
	}

	raw := []byte("From: me@example.com\r\nSubject: hi\r\n\r\nbody\r\n")
	when := time.Now().UTC().Add(time.Hour).Truncate(time.Second)
	id, err := db.InsertOutbox(ctx, OutboxRow{
		AccountID:     acct.ID,
		EnvelopeFrom:  "me@example.com",
		Recipients:    "you@example.com\nhidden@example.com",
		Raw:           raw,
		State:         "queued",
		NextAttemptAt: when,
	})
	if err != nil {
		t.Fatalf("insert: %v", err)
	}

	got, err := db.GetOutbox(ctx, id)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if !bytes.Equal(got.Raw, raw) {
		t.Fatal("raw_message did not survive the round trip, so the preview would parse the wrong bytes")
	}
	if got.ID != id {
		t.Fatalf("id = %d, want %d", got.ID, id)
	}
	if got.AccountID != acct.ID {
		t.Fatalf("account id = %d, want %d", got.AccountID, acct.ID)
	}
	if got.EnvelopeFrom != "me@example.com" {
		t.Fatalf("envelope from = %q", got.EnvelopeFrom)
	}
	if got.Recipients != "you@example.com\nhidden@example.com" {
		t.Fatalf("recipients = %q", got.Recipients)
	}
	if got.State != "queued" {
		t.Fatalf("state = %q, want queued", got.State)
	}
	if !got.NextAttemptAt.Equal(when) {
		t.Fatalf("next attempt = %v, want %v", got.NextAttemptAt, when)
	}
}

// readyRow queues one row in the given state, due at the given time. The
// account is real because the outbox foreign-keys it.
func readyRow(t *testing.T, db *DB, state string, due time.Time) int64 {
	t.Helper()
	ctx := context.Background()
	acct, err := db.EnsureLocalAccount(ctx)
	if err != nil {
		t.Fatalf("local account: %v", err)
	}
	id, err := db.InsertOutbox(ctx, OutboxRow{
		AccountID:     acct.ID,
		EnvelopeFrom:  "me@example.com",
		Recipients:    "you@example.com",
		Raw:           []byte("Subject: hi\r\n\r\nbody\r\n"),
		State:         state,
		NextAttemptAt: due,
	})
	if err != nil {
		t.Fatalf("insert %s row: %v", state, err)
	}
	return id
}

// countReady is CountOutboxReady with the states the outbox package uses, so the
// tests do not have to repeat them.
func countReady(t *testing.T, db *DB, now time.Time) int {
	t.Helper()
	n, err := db.CountOutboxReady(context.Background(), "queued", "sending", now)
	if err != nil {
		t.Fatalf("count ready: %v", err)
	}
	return n
}

// A "send later" message waits for its own moment. Counting it as work in
// progress is what made sync stand aside, holding the process-wide sync lock,
// for as long as the schedule lasted - so it must not count.
func TestCountOutboxReadyExcludesAFutureScheduledSend(t *testing.T) {
	db := newTestDB(t)
	now := time.Now().UTC().Truncate(time.Second)
	readyRow(t, db, "queued", now.Add(30*time.Minute))

	if got := countReady(t, db, now); got != 0 {
		t.Fatalf("ready = %d, want 0: a message scheduled for later is not ready now", got)
	}
}

// Once its time has come it counts, so the sync stands aside for the moment the
// send is actually happening.
func TestCountOutboxReadyIncludesADueSend(t *testing.T) {
	db := newTestDB(t)
	now := time.Now().UTC().Truncate(time.Second)
	readyRow(t, db, "queued", now.Add(-time.Minute))

	if got := countReady(t, db, now); got != 1 {
		t.Fatalf("ready = %d, want 1", got)
	}
}

// The boundary is inclusive, matching ClaimDueOutbox's `next_attempt_at <= now`.
// If the two disagreed, a message could sit exactly on the boundary counted as
// "not ready" while the worker was claiming it.
func TestCountOutboxReadyIsInclusiveAtTheBoundary(t *testing.T) {
	db := newTestDB(t)
	now := time.Now().UTC().Truncate(time.Second)
	readyRow(t, db, "queued", now)

	if got := countReady(t, db, now); got != 1 {
		t.Fatalf("ready = %d, want 1: a message due exactly now is due", got)
	}
}

// Mid-send counts whatever its timestamp says, because the worker is holding it
// right now.
func TestCountOutboxReadyIncludesSending(t *testing.T) {
	db := newTestDB(t)
	now := time.Now().UTC().Truncate(time.Second)
	// deliberately far in the future, to prove the state alone decides
	readyRow(t, db, "sending", now.Add(24*time.Hour))

	if got := countReady(t, db, now); got != 1 {
		t.Fatalf("ready = %d, want 1: a message being sent is work in progress", got)
	}
}

// Nothing that has finished, or run out of retries, holds the sync back. A
// failed message is not retried on its own (see Queue.Retry), so counting it
// would stall sync until a human acted.
func TestCountOutboxReadyIgnoresFinishedStates(t *testing.T) {
	db := newTestDB(t)
	now := time.Now().UTC().Truncate(time.Second)
	readyRow(t, db, "sent", now.Add(-time.Hour))
	readyRow(t, db, "failed", now.Add(-time.Hour))

	if got := countReady(t, db, now); got != 0 {
		t.Fatalf("ready = %d, want 0", got)
	}
}
