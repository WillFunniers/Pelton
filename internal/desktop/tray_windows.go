//go:build windows

package desktop

import (
	"runtime"
	"sync/atomic"

	"github.com/energye/systray"
)

// The notification-area icon is served by systray, whose Windows backend is
// plain win32 syscalls: no cgo, no network.

// trayUp is set once systray's loop is running; systray calls made before
// that have no icon to act on. trayDotted, the icon with the unread dot, is
// written once before it and only read after it. It stays nil if the icon
// could not be drawn on, and the tooltip alone then carries the count.
var (
	trayUp     atomic.Bool
	trayDotted []byte
)

// startTray brings up the tray icon on its own OS thread. systray.Run blocks
// inside its message loop, so it runs in a goroutine for the app's lifetime;
// stopTray ends it at shutdown.
func (a *App) startTray() {
	goSafe("the notification area icon", func() {
		// win32 delivers a window's messages only to the thread that created
		// it, so the goroutine must not move off that thread mid-loop.
		runtime.LockOSThread()
		systray.Run(a.trayReady, nil)
	})
}

// stopTray removes the tray icon. Safe to call even if the tray never came up.
func (a *App) stopTray() {
	systray.Quit()
}

// trayReady builds the icon and menu once systray's loop is up.
func (a *App) trayReady() {
	if len(a.trayIcon) > 0 {
		systray.SetIcon(a.trayIcon)
	}
	systray.SetTooltip("Pelton")

	for _, item := range a.trayMenuItems(a.showWindow) {
		if item.action == nil {
			systray.AddSeparator()
			continue
		}
		systray.AddMenuItem(item.label, "").Click(item.action)
	}

	// left click reopens the window; the menu only shows on right click.
	systray.SetOnClick(func(systray.IMenu) {
		a.showWindow()
	})
	systray.SetOnRClick(func(m systray.IMenu) {
		_ = m.ShowMenu()
	})

	if len(a.trayIcon) > 0 {
		var err error
		if trayDotted, err = dottedICO(a.trayIcon); err != nil {
			a.log.Error("tray icon: draw the unread dot", "err", err)
		}
	}
	trayUp.Store(true)
	// the frontend may have reported a count before the loop was up.
	a.applyUnreadBadge()
}

// setPlatformBadge shows the unread dot on the tray icon, with the count in
// its tooltip. Zero clears both.
func (a *App) setPlatformBadge(count int) {
	if !trayUp.Load() {
		return
	}
	icon := a.trayIcon
	if count > 0 && trayDotted != nil {
		icon = trayDotted
	}
	if len(icon) > 0 {
		systray.SetIcon(icon)
	}
	tip := "Pelton"
	if count > 0 {
		tip += "\n" + trayUnreadText(a, count)
	}
	systray.SetTooltip(tip)
}

// dottedICO is the icon with the unread dot on every frame.
func dottedICO(ico []byte) ([]byte, error) {
	frames, err := iconFrames(ico)
	if err != nil {
		return nil, err
	}
	for i, f := range frames {
		frames[i] = withDot(f)
	}
	return encodeICO(frames)
}
