package configsync

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/peltonapp/Pelton/internal/storage"
)

// writeMarker drops a legacy in-place marker into stateDir pointing at path.
func writeMarker(t *testing.T, stateDir, path string) {
	t.Helper()
	data, err := json.Marshal(inPlaceMarker{Path: path})
	if err != nil {
		t.Fatalf("encode marker: %v", err)
	}
	if err := os.MkdirAll(stateDir, 0o755); err != nil {
		t.Fatalf("create state dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(stateDir, inPlaceMarkerFile), data, 0o644); err != nil {
		t.Fatalf("write marker: %v", err)
	}
}

func TestActiveDataDirWithoutAMarker(t *testing.T) {
	stateDir := t.TempDir()
	defaultDir := filepath.Join(t.TempDir(), "data")

	got, err := ActiveDataDir(stateDir, defaultDir)
	if err != nil {
		t.Fatalf("ActiveDataDir: %v", err)
	}
	if got != defaultDir {
		t.Errorf("ActiveDataDir() = %q, want the default %q", got, defaultDir)
	}
}

func TestActiveDataDirFollowsAReachableMarker(t *testing.T) {
	stateDir := t.TempDir()
	inPlace := t.TempDir()
	writeMarker(t, stateDir, inPlace)

	got, err := ActiveDataDir(stateDir, filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatalf("ActiveDataDir: %v", err)
	}
	if got != inPlace {
		t.Errorf("ActiveDataDir() = %q, want the marked directory %q", got, inPlace)
	}
}

// The marked folder is on a drive that is not mounted, or in a cloud folder the
// user has since deleted. Opening a database there would fail, so the launch
// has to fall back to the normal directory rather than refusing to start.
func TestActiveDataDirIgnoresAnUnreachableMarker(t *testing.T) {
	stateDir := t.TempDir()
	defaultDir := filepath.Join(t.TempDir(), "data")
	writeMarker(t, stateDir, filepath.Join(t.TempDir(), "gone"))

	got, err := ActiveDataDir(stateDir, defaultDir)
	if err != nil {
		t.Fatalf("ActiveDataDir: %v", err)
	}
	if got != defaultDir {
		t.Errorf("ActiveDataDir() = %q, want the default %q", got, defaultDir)
	}
}

func TestActiveDataDirIgnoresAnEmptyMarkerPath(t *testing.T) {
	stateDir := t.TempDir()
	defaultDir := filepath.Join(t.TempDir(), "data")
	writeMarker(t, stateDir, "")

	got, err := ActiveDataDir(stateDir, defaultDir)
	if err != nil {
		t.Fatalf("ActiveDataDir: %v", err)
	}
	if got != defaultDir {
		t.Errorf("ActiveDataDir() = %q, want the default %q", got, defaultDir)
	}
}

// A marker file that is not valid json is a corrupt one. Reporting the error
// matters: silently treating it as absent would strand a user whose live data
// is in the marked folder.
func TestActiveDataDirReportsACorruptMarker(t *testing.T) {
	stateDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(stateDir, inPlaceMarkerFile), []byte("{nope"), 0o644); err != nil {
		t.Fatalf("write marker: %v", err)
	}

	if _, err := ActiveDataDir(stateDir, filepath.Join(t.TempDir(), "data")); err == nil {
		t.Error("ActiveDataDir with an unreadable marker returned no error")
	}
}

func TestCopyDirCopiesNestedFiles(t *testing.T) {
	src, dst := t.TempDir(), filepath.Join(t.TempDir(), "out")
	if err := os.MkdirAll(filepath.Join(src, "a", "b"), 0o755); err != nil {
		t.Fatalf("create tree: %v", err)
	}
	if err := os.WriteFile(filepath.Join(src, "a", "b", "one.eml"), []byte("body"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	if err := copyDir(src, dst); err != nil {
		t.Fatalf("copyDir: %v", err)
	}

	got, err := os.ReadFile(filepath.Join(dst, "a", "b", "one.eml"))
	if err != nil {
		t.Fatalf("read copy: %v", err)
	}
	if string(got) != "body" {
		t.Errorf("copied contents = %q, want %q", got, "body")
	}
}

// copyDir only copies files newer than the ones already there, so a second run
// over an unchanged tree has to leave the destination alone rather than
// rewriting every attachment.
func TestCopyDirKeepsANewerDestinationFile(t *testing.T) {
	src, dst := t.TempDir(), t.TempDir()
	if err := os.WriteFile(filepath.Join(src, "one.eml"), []byte("old"), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	old := time.Now().Add(-time.Hour)
	if err := os.Chtimes(filepath.Join(src, "one.eml"), old, old); err != nil {
		t.Fatalf("set source time: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dst, "one.eml"), []byte("newer"), 0o644); err != nil {
		t.Fatalf("write destination: %v", err)
	}

	if err := copyDir(src, dst); err != nil {
		t.Fatalf("copyDir: %v", err)
	}

	got, err := os.ReadFile(filepath.Join(dst, "one.eml"))
	if err != nil {
		t.Fatalf("read destination: %v", err)
	}
	if string(got) != "newer" {
		t.Errorf("destination = %q, want the newer file left in place", got)
	}
}

func TestCopyDirWithNoSourceIsNotAnError(t *testing.T) {
	if err := copyDir(filepath.Join(t.TempDir(), "missing"), t.TempDir()); err != nil {
		t.Errorf("copyDir over a missing source returned %v", err)
	}
}

// The copy goes through a temp file and a rename, so a destination is never
// half-written. The temp file must not survive a successful copy.
func TestCopyFileLeavesNoTempBehind(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "in")
	dst := filepath.Join(dir, "out")
	if err := os.WriteFile(src, []byte("payload"), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}

	if err := copyFile(src, dst); err != nil {
		t.Fatalf("copyFile: %v", err)
	}

	got, err := os.ReadFile(dst)
	if err != nil {
		t.Fatalf("read destination: %v", err)
	}
	if string(got) != "payload" {
		t.Errorf("destination = %q, want %q", got, "payload")
	}
	if _, err := os.Stat(dst + ".tmp"); err == nil {
		t.Error("the temp file is still there after a successful copy")
	}
}

// The migration moves a device off the legacy in-place directory: the database
// and attachments land in the normal state directory and the marker goes, so
// the next launch no longer follows it.
func TestMigrateInPlaceBackMovesTheDataAndClearsTheMarker(t *testing.T) {
	ctx := context.Background()
	inPlace := t.TempDir()
	stateDir := t.TempDir()

	store, err := storage.Open(filepath.Join(inPlace, "pelton.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer store.Close()
	if err := store.RunMigrations(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if err := os.MkdirAll(store.AttachmentsDir(), 0o755); err != nil {
		t.Fatalf("create attachments dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(store.AttachmentsDir(), "one.pdf"), []byte("pdf"), 0o644); err != nil {
		t.Fatalf("write attachment: %v", err)
	}
	writeMarker(t, stateDir, inPlace)

	migrated, err := MigrateInPlaceBack(ctx, store, stateDir, "pelton.db")
	if err != nil {
		t.Fatalf("MigrateInPlaceBack: %v", err)
	}
	if !migrated {
		t.Fatal("MigrateInPlaceBack reported no migration with a marker present")
	}

	if _, err := os.Stat(filepath.Join(stateDir, "pelton.db")); err != nil {
		t.Errorf("no database in the state directory: %v", err)
	}
	if _, err := os.Stat(filepath.Join(stateDir, attachmentsDir, "one.pdf")); err != nil {
		t.Errorf("the attachment did not come along: %v", err)
	}
	if _, err := os.Stat(filepath.Join(stateDir, inPlaceMarkerFile)); err == nil {
		t.Error("the marker is still there, so the next launch would redirect again")
	}
}

func TestMigrateInPlaceBackWithoutAMarkerDoesNothing(t *testing.T) {
	ctx := context.Background()
	stateDir := t.TempDir()

	store, err := storage.Open(filepath.Join(t.TempDir(), "pelton.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer store.Close()
	if err := store.RunMigrations(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	migrated, err := MigrateInPlaceBack(ctx, store, stateDir, "pelton.db")
	if err != nil {
		t.Fatalf("MigrateInPlaceBack: %v", err)
	}
	if migrated {
		t.Error("MigrateInPlaceBack reported a migration with no marker present")
	}
	if _, err := os.Stat(filepath.Join(stateDir, "pelton.db")); err == nil {
		t.Error("a database was written to the state directory anyway")
	}
}
