//go:build linux

package desktop

/*
#cgo pkg-config: gtk+-3.0 gdk-wayland-3.0
#include <stdlib.h>
#include <gtk/gtk.h>
#include <gdk/gdkwayland.h>

// setActivationToken hands the token to GDK, which spends it on the next
// present of a window. Wayland only: X11 needs no token to raise a window.
static gboolean setActivationToken(gpointer data)
{
	char *token = data;
	GdkDisplay *display = gdk_display_get_default();
	if (GDK_IS_WAYLAND_DISPLAY(display)) {
		gdk_wayland_display_set_startup_notification_id(display, token);
	}
	free(token);
	return G_SOURCE_REMOVE;
}

static void queueActivationToken(char *token)
{
	g_idle_add(setActivationToken, token);
}
*/
import "C"

// presentWindow is showWindow with an xdg-activation token to spend, for the
// tray. The token goes to GDK through the same main-thread idle queue wails
// uses for its show and present calls, and GLib runs idles in order, so it is
// in place before showWindow's calls run. An empty token is a plain show.
func (a *App) presentWindow(token string) {
	if token != "" {
		C.queueActivationToken(C.CString(token))
	}
	a.showWindow()
}
