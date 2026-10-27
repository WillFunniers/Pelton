//go:build !darwin && !windows && !linux

package desktop

// Only macOS has a dock tile to badge, and only Windows and Linux have a tray
// icon to dot (see tray_windows.go and tray_linux.go); anywhere else there is
// nothing to show the count on.
func (a *App) setPlatformBadge(_ int) {}
