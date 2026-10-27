//go:build !windows && !linux

package desktop

// No tray on macOS (see tray.go): the Dock icon reopens the hidden window,
// and Quit lives in the native menu.

func (a *App) startTray() {}

func (a *App) stopTray() {}
