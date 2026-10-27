//go:build linux

package desktop

import (
	"fmt"
	"image"
	"image/color"
	"os"
	"slices"
	"sync"
	"sync/atomic"

	"github.com/godbus/dbus/v5"
	"github.com/godbus/dbus/v5/introspect"
	"github.com/godbus/dbus/v5/prop"

	"github.com/peltonapp/Pelton/internal/storage"
)

// The Linux tray icon is a StatusNotifierItem on the session bus, the protocol
// every current tray host speaks (Plasma, GNOME's AppIndicator extension,
// waybar and the rest); the host shows the item's dbusmenu itself.
//
// The item and its menu are served here directly rather than through the
// systray dependency Windows uses. Raising a window on Wayland needs the
// xdg-activation token that hosts hand over with ProvideXdgActivationToken, a
// KDE extension to the protocol, and systray's item has no such method and no
// way to add one. Session bus only: nothing here leaves the machine.
//
// This file exists only for that gap and should be deleted once systray (or
// whichever library Windows uses then) delivers the token itself. The one
// requirement to check first: the token must reach the app before the
// Activate or menu click it belongs to, in bus order, since hosts send it
// immediately before the action and a token is single use (see observe).
// The swap is then: drop this file and its test, widen tray_windows.go's
// build tag to Linux, and pass a show function to trayMenuItems and the
// click handlers that calls presentWindow with the token instead of
// showWindow. window_linux.go stays, GTK needs the token either way.

const (
	sniWatcherName = "org.kde.StatusNotifierWatcher"
	sniWatcherPath = "/StatusNotifierWatcher"
	sniInterface   = "org.kde.StatusNotifierItem"
	sniPath        = "/StatusNotifierItem"
	menuInterface  = "com.canonical.dbusmenu"
	menuPath       = "/StatusNotifierMenu"
)

// tray is the running StatusNotifierItem, nil until startTray has one up. The
// unread badge reaches it from whichever goroutine the frontend's call runs on.
var tray atomic.Pointer[statusNotifier]

// statusNotifier serves the org.kde.StatusNotifierItem object.
type statusNotifier struct {
	app   *App
	conn  *dbus.Conn
	props *prop.Properties
	title string
	// icon and dotted are the icon without and with the unread dot, drawn once
	// at export so a changing count only swaps between them.
	icon, dotted []sniPixmap
	// token is the newest activation token the host provided and no action
	// has spent. A token is single use and tied to the click that produced it,
	// and the compositor invalidates it as soon as it issues the next one.
	mu    sync.Mutex
	token string
}

// trayMenu serves the com.canonical.dbusmenu object for the tray's context
// menu. The menu is fixed for the app's lifetime, so the layout revision never
// changes and no update signals are needed.
type trayMenu struct {
	items []trayMenuItem
}

// sniPixmap is one icon bitmap in the wire format hosts expect: ARGB32 in
// network byte order.
type sniPixmap struct {
	Width, Height int32
	Data          []byte
}

// sniToolTip is the (sa(iiay)ss) tooltip structure.
type sniToolTip struct {
	IconName    string
	IconPixmaps []sniPixmap
	Title       string
	Description string
}

// menuLayout is the (ia{sv}av) dbusmenu layout node.
type menuLayout struct {
	ID         int32
	Properties map[string]dbus.Variant
	Children   []dbus.Variant
}

// menuProperties is one element of the a(ia{sv}) GetGroupProperties reply.
type menuProperties struct {
	ID         int32
	Properties map[string]dbus.Variant
}

// menuEvent is one element of the a(isvu) EventGroup argument.
type menuEvent struct {
	ID        int32
	EventID   string
	Data      dbus.Variant
	Timestamp uint32
}

// startTray puts the item on the session bus and registers it with the tray
// host. Without a session bus there is no tray and the app carries on: the
// single-instance handler still surfaces a hidden window on relaunch. Without
// a host the item waits on the bus and registers when one appears, which also
// covers a host that restarts later.
func (a *App) startTray() {
	t := &statusNotifier{app: a}
	conn, err := dbus.ConnectSessionBus(dbus.WithIncomingInterceptor(t.observe))
	if err != nil {
		a.log.Info("tray icon skipped: no session bus", "err", err)
		return
	}
	t.conn = conn
	if err := t.export(); err != nil {
		a.log.Error("tray icon", "err", err)
		conn.Close()
		return
	}
	tray.Store(t)
	// the frontend may have reported a count before the item was up.
	a.applyUnreadBadge()

	// hosts learn about items only through RegisterStatusNotifierItem, so a
	// host that (re)appears has to be told again.
	err = conn.AddMatchSignal(
		dbus.WithMatchInterface("org.freedesktop.DBus"),
		dbus.WithMatchMember("NameOwnerChanged"),
		dbus.WithMatchArg(0, sniWatcherName),
	)
	if err != nil {
		a.log.Error("tray icon: watch for a tray host", "err", err)
	}
	signals := make(chan *dbus.Signal, 4)
	conn.Signal(signals)
	goSafe("the tray icon", func() {
		for sig := range signals {
			if len(sig.Body) == 3 && sig.Body[2] != "" {
				t.register()
			}
		}
	})

	var hasHost bool
	if err := conn.BusObject().Call("org.freedesktop.DBus.NameHasOwner", 0, sniWatcherName).Store(&hasHost); err != nil {
		a.log.Error("tray icon: query the session bus", "err", err)
		return
	}
	if hasHost {
		t.register()
	} else {
		a.log.Info("tray icon: no tray host on the session bus, waiting for one")
	}
}

// stopTray takes the item off the bus. The host drops it when the name goes
// away. Safe to call even if the tray never came up.
func (a *App) stopTray() {
	if t := tray.Load(); t != nil {
		t.conn.Close()
	}
}

// setPlatformBadge shows the unread dot on the tray icon, with the count in
// its tooltip. Zero clears both.
func (a *App) setPlatformBadge(count int) {
	if t := tray.Load(); t != nil {
		t.setUnread(count)
	}
}

// export puts the item, its menu and their properties on the bus under the
// per-process name hosts expect.
func (t *statusNotifier) export() error {
	a := t.app
	t.title = "Pelton"
	id := "pelton"
	if a.channel == storage.ChannelNightly {
		t.title = "Pelton Nightly"
		id = "pelton-nightly"
	}
	t.icon, t.dotted = []sniPixmap{}, []sniPixmap{}
	if len(a.trayIcon) > 0 {
		frames, err := iconFrames(a.trayIcon)
		if err != nil {
			return fmt.Errorf("decode icon: %w", err)
		}
		for _, f := range frames {
			t.icon = append(t.icon, pixmapFromImage(f))
			t.dotted = append(t.dotted, pixmapFromImage(withDot(f)))
		}
	}

	if err := t.conn.Export(t, sniPath, sniInterface); err != nil {
		return fmt.Errorf("export item: %w", err)
	}
	// the whole spec property set, unused ones empty, so a host that reads
	// properties one at a time never trips over a missing one.
	// IconPixmap gets its own copy of the icon: prop stores every later value
	// into the one it was given, copying a slice element by element when the
	// lengths match, which would otherwise write the dotted icon over t.icon.
	props, err := prop.Export(t.conn, sniPath, map[string]map[string]*prop.Prop{sniInterface: {
		"Category":            {Value: "ApplicationStatus", Emit: prop.EmitTrue},
		"Id":                  {Value: id, Emit: prop.EmitTrue},
		"Title":               {Value: t.title, Emit: prop.EmitTrue},
		"Status":              {Value: "Active", Emit: prop.EmitTrue},
		"WindowId":            {Value: int32(0), Emit: prop.EmitTrue},
		"IconName":            {Value: "", Emit: prop.EmitTrue},
		"IconPixmap":          {Value: slices.Clone(t.icon), Emit: prop.EmitTrue},
		"IconThemePath":       {Value: "", Emit: prop.EmitTrue},
		"OverlayIconName":     {Value: "", Emit: prop.EmitTrue},
		"OverlayIconPixmap":   {Value: []sniPixmap{}, Emit: prop.EmitTrue},
		"AttentionIconName":   {Value: "", Emit: prop.EmitTrue},
		"AttentionIconPixmap": {Value: []sniPixmap{}, Emit: prop.EmitTrue},
		"AttentionMovieName":  {Value: "", Emit: prop.EmitTrue},
		"ToolTip":             {Value: t.toolTip(0), Emit: prop.EmitTrue},
		"ItemIsMenu":          {Value: false, Emit: prop.EmitTrue},
		"Menu":                {Value: dbus.ObjectPath(menuPath), Emit: prop.EmitTrue},
	}})
	if err != nil {
		return fmt.Errorf("export item properties: %w", err)
	}
	t.props = props
	itemNode := introspect.Node{Name: sniPath, Interfaces: []introspect.Interface{
		introspect.IntrospectData, prop.IntrospectData, sniIntrospection,
	}}
	if err := t.conn.Export(introspect.NewIntrospectable(&itemNode), sniPath, "org.freedesktop.DBus.Introspectable"); err != nil {
		return fmt.Errorf("export item introspection: %w", err)
	}

	m := &trayMenu{items: t.app.trayMenuItems(t.raise)}
	if err := t.conn.Export(m, menuPath, menuInterface); err != nil {
		return fmt.Errorf("export menu: %w", err)
	}
	_, err = prop.Export(t.conn, menuPath, map[string]map[string]*prop.Prop{menuInterface: {
		"Version":       {Value: uint32(3), Emit: prop.EmitTrue},
		"TextDirection": {Value: "ltr", Emit: prop.EmitTrue},
		"Status":        {Value: "normal", Emit: prop.EmitTrue},
		"IconThemePath": {Value: []string{}, Emit: prop.EmitTrue},
	}})
	if err != nil {
		return fmt.Errorf("export menu properties: %w", err)
	}
	menuNode := introspect.Node{Name: menuPath, Interfaces: []introspect.Interface{
		introspect.IntrospectData, prop.IntrospectData, menuIntrospection,
	}}
	if err := t.conn.Export(introspect.NewIntrospectable(&menuNode), menuPath, "org.freedesktop.DBus.Introspectable"); err != nil {
		return fmt.Errorf("export menu introspection: %w", err)
	}

	name := fmt.Sprintf("org.kde.StatusNotifierItem-%d-1", os.Getpid())
	if _, err := t.conn.RequestName(name, dbus.NameFlagDoNotQueue); err != nil {
		return fmt.Errorf("request bus name: %w", err)
	}
	return nil
}

// register tells the host about the item. A path argument means "this
// connection's item at that path".
func (t *statusNotifier) register() {
	call := t.conn.Object(sniWatcherName, sniWatcherPath).Call(sniWatcherName+".RegisterStatusNotifierItem", 0, sniPath)
	if call.Err != nil {
		t.app.log.Error("tray icon: register with the tray host", "err", call.Err)
	}
}

// setUnread swaps the icon for the dotted one and puts the count in the
// tooltip. Hosts watch the item's own New* signals rather than
// PropertiesChanged, and a host that registers later reads the properties
// fresh, so nothing has to be replayed for it.
func (t *statusNotifier) setUnread(count int) {
	icon := t.icon
	if count > 0 {
		icon = t.dotted
	}
	t.props.SetMust(sniInterface, "IconPixmap", icon)
	t.props.SetMust(sniInterface, "ToolTip", t.toolTip(count))
	for _, signal := range []string{"NewIcon", "NewToolTip"} {
		if err := t.conn.Emit(sniPath, sniInterface+"."+signal); err != nil {
			t.app.log.Error("tray icon: signal the tray host", "signal", signal, "err", err)
		}
	}
}

// toolTip is the item's tooltip: its title, and under it the unread count
// when there is one.
func (t *statusNotifier) toolTip(count int) sniToolTip {
	tip := sniToolTip{Title: t.title, IconPixmaps: []sniPixmap{}}
	if count > 0 {
		tip.Description = trayUnreadText(t.app, count)
	}
	return tip
}

// observe sees every incoming message in bus order, before godbus dispatches
// it, and is where activation tokens are recorded. The host sends the token
// right before the action it is for, but godbus runs each method handler in
// its own goroutine, so a handler recording it could lose the race against
// the action's handler, which would then spend the previous, already
// invalidated token. Recorded here, the token is in place before the action
// is even dispatched.
func (t *statusNotifier) observe(msg *dbus.Message) {
	if msg.Type != dbus.TypeMethodCall || len(msg.Body) != 1 {
		return
	}
	iface, _ := msg.Headers[dbus.FieldInterface].Value().(string)
	member, _ := msg.Headers[dbus.FieldMember].Value().(string)
	if iface != sniInterface || member != "ProvideXdgActivationToken" {
		return
	}
	if token, ok := msg.Body[0].(string); ok {
		t.mu.Lock()
		t.token = token
		t.mu.Unlock()
	}
}

// takeToken spends the token recorded for the current action, if any.
func (t *statusNotifier) takeToken() string {
	t.mu.Lock()
	defer t.mu.Unlock()
	token := t.token
	t.token = ""
	return token
}

// raise brings the window forward from a tray action. Wayland compositors
// refuse to let a window without recent input take the foreground unless the
// request spends an activation token; without one the compositor at most
// marks the window as wanting attention.
func (t *statusNotifier) raise() {
	t.app.presentWindow(t.takeToken())
}

// Activate is the host's left click.
func (t *statusNotifier) Activate(x, y int32) *dbus.Error {
	t.raise()
	return nil
}

// SecondaryActivate is the host's middle click, unused.
func (t *statusNotifier) SecondaryActivate(x, y int32) *dbus.Error {
	return nil
}

// ContextMenu is only called by hosts that cannot show the dbusmenu
// themselves; there is nothing to pop up natively.
func (t *statusNotifier) ContextMenu(x, y int32) *dbus.Error {
	return nil
}

// Scroll is the host's scroll wheel over the icon, unused.
func (t *statusNotifier) Scroll(delta int32, orientation string) *dbus.Error {
	return nil
}

// ProvideXdgActivationToken is the host handing over the token for the action
// that follows. observe has already recorded it; this only acknowledges the
// call.
func (t *statusNotifier) ProvideXdgActivationToken(token string) *dbus.Error {
	return nil
}

// layout is the dbusmenu node for one item; ids start at 1, 0 is the root.
func (m *trayMenu) layout(id int32) (menuLayout, bool) {
	if id < 1 || int(id) > len(m.items) {
		return menuLayout{}, false
	}
	item := m.items[id-1]
	props := map[string]dbus.Variant{}
	if item.action == nil {
		props["type"] = dbus.MakeVariant("separator")
	} else {
		props["label"] = dbus.MakeVariant(item.label)
		props["enabled"] = dbus.MakeVariant(true)
	}
	return menuLayout{ID: id, Properties: props, Children: []dbus.Variant{}}, true
}

// GetLayout returns the menu below parentID. The menu is one level deep, so
// only the root has children and any nonzero depth includes them all.
func (m *trayMenu) GetLayout(parentID, depth int32, propertyNames []string) (uint32, menuLayout, *dbus.Error) {
	if parentID != 0 {
		l, ok := m.layout(parentID)
		if !ok {
			return 0, menuLayout{}, dbus.MakeFailedError(fmt.Errorf("no menu item %d", parentID))
		}
		return 1, l, nil
	}
	root := menuLayout{Properties: map[string]dbus.Variant{"children-display": dbus.MakeVariant("submenu")}, Children: []dbus.Variant{}}
	if depth != 0 {
		for i := range m.items {
			l, _ := m.layout(int32(i + 1))
			root.Children = append(root.Children, dbus.MakeVariant(l))
		}
	}
	return 1, root, nil
}

// GetGroupProperties returns the properties of the given items; unknown ids
// are skipped, as the protocol allows.
func (m *trayMenu) GetGroupProperties(ids []int32, propertyNames []string) ([]menuProperties, *dbus.Error) {
	out := []menuProperties{}
	for _, id := range ids {
		if l, ok := m.layout(id); ok {
			out = append(out, menuProperties{ID: id, Properties: l.Properties})
		}
	}
	return out, nil
}

// GetProperty returns one property of one item.
func (m *trayMenu) GetProperty(id int32, name string) (dbus.Variant, *dbus.Error) {
	if l, ok := m.layout(id); ok {
		if v, ok := l.Properties[name]; ok {
			return v, nil
		}
	}
	return dbus.Variant{}, dbus.MakeFailedError(fmt.Errorf("no property %s on menu item %d", name, id))
}

// Event is the host reporting interaction with an item; only clicks matter.
func (m *trayMenu) Event(id int32, eventID string, data dbus.Variant, timestamp uint32) *dbus.Error {
	m.click(id, eventID)
	return nil
}

// EventGroup is Event for several items at once.
func (m *trayMenu) EventGroup(events []menuEvent) ([]int32, *dbus.Error) {
	for _, e := range events {
		m.click(e.ID, e.EventID)
	}
	return []int32{}, nil
}

// click runs the action behind a "clicked" event, ignoring anything else.
func (m *trayMenu) click(id int32, eventID string) {
	if eventID != "clicked" || id < 1 || int(id) > len(m.items) {
		return
	}
	if action := m.items[id-1].action; action != nil {
		action()
	}
}

// AboutToShow is the host asking whether the menu changed; it never does.
func (m *trayMenu) AboutToShow(id int32) (bool, *dbus.Error) {
	return false, nil
}

// AboutToShowGroup is AboutToShow for several items at once.
func (m *trayMenu) AboutToShowGroup(ids []int32) ([]int32, []int32, *dbus.Error) {
	return []int32{}, []int32{}, nil
}

// pixmapFromImage converts one frame into the host's wire format: straight
// (not premultiplied) alpha, one big-endian ARGB word per pixel.
func pixmapFromImage(img image.Image) sniPixmap {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	out := make([]byte, 0, w*h*4)
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			c := color.NRGBAModel.Convert(img.At(x, y)).(color.NRGBA)
			out = append(out, c.A, c.R, c.G, c.B)
		}
	}
	return sniPixmap{Width: int32(w), Height: int32(h), Data: out}
}

// introspection data, so hosts that look before they call see the methods.
var (
	sniIntrospection = introspect.Interface{
		Name: sniInterface,
		Methods: []introspect.Method{
			{Name: "Activate", Args: []introspect.Arg{{Name: "x", Type: "i", Direction: "in"}, {Name: "y", Type: "i", Direction: "in"}}},
			{Name: "SecondaryActivate", Args: []introspect.Arg{{Name: "x", Type: "i", Direction: "in"}, {Name: "y", Type: "i", Direction: "in"}}},
			{Name: "ContextMenu", Args: []introspect.Arg{{Name: "x", Type: "i", Direction: "in"}, {Name: "y", Type: "i", Direction: "in"}}},
			{Name: "Scroll", Args: []introspect.Arg{{Name: "delta", Type: "i", Direction: "in"}, {Name: "orientation", Type: "s", Direction: "in"}}},
			{Name: "ProvideXdgActivationToken", Args: []introspect.Arg{{Name: "token", Type: "s", Direction: "in"}}},
		},
		Signals: []introspect.Signal{
			{Name: "NewIcon"},
			{Name: "NewToolTip"},
		},
		Properties: []introspect.Property{
			{Name: "Category", Type: "s", Access: "read"},
			{Name: "Id", Type: "s", Access: "read"},
			{Name: "Title", Type: "s", Access: "read"},
			{Name: "Status", Type: "s", Access: "read"},
			{Name: "WindowId", Type: "i", Access: "read"},
			{Name: "IconName", Type: "s", Access: "read"},
			{Name: "IconPixmap", Type: "a(iiay)", Access: "read"},
			{Name: "IconThemePath", Type: "s", Access: "read"},
			{Name: "OverlayIconName", Type: "s", Access: "read"},
			{Name: "OverlayIconPixmap", Type: "a(iiay)", Access: "read"},
			{Name: "AttentionIconName", Type: "s", Access: "read"},
			{Name: "AttentionIconPixmap", Type: "a(iiay)", Access: "read"},
			{Name: "AttentionMovieName", Type: "s", Access: "read"},
			{Name: "ToolTip", Type: "(sa(iiay)ss)", Access: "read"},
			{Name: "ItemIsMenu", Type: "b", Access: "read"},
			{Name: "Menu", Type: "o", Access: "read"},
		},
	}
	menuIntrospection = introspect.Interface{
		Name: menuInterface,
		Methods: []introspect.Method{
			{Name: "GetLayout", Args: []introspect.Arg{
				{Name: "parentId", Type: "i", Direction: "in"}, {Name: "recursionDepth", Type: "i", Direction: "in"}, {Name: "propertyNames", Type: "as", Direction: "in"},
				{Name: "revision", Type: "u", Direction: "out"}, {Name: "layout", Type: "(ia{sv}av)", Direction: "out"}}},
			{Name: "GetGroupProperties", Args: []introspect.Arg{
				{Name: "ids", Type: "ai", Direction: "in"}, {Name: "propertyNames", Type: "as", Direction: "in"},
				{Name: "properties", Type: "a(ia{sv})", Direction: "out"}}},
			{Name: "GetProperty", Args: []introspect.Arg{
				{Name: "id", Type: "i", Direction: "in"}, {Name: "name", Type: "s", Direction: "in"},
				{Name: "value", Type: "v", Direction: "out"}}},
			{Name: "Event", Args: []introspect.Arg{
				{Name: "id", Type: "i", Direction: "in"}, {Name: "eventId", Type: "s", Direction: "in"},
				{Name: "data", Type: "v", Direction: "in"}, {Name: "timestamp", Type: "u", Direction: "in"}}},
			{Name: "EventGroup", Args: []introspect.Arg{
				{Name: "events", Type: "a(isvu)", Direction: "in"}, {Name: "idErrors", Type: "ai", Direction: "out"}}},
			{Name: "AboutToShow", Args: []introspect.Arg{
				{Name: "id", Type: "i", Direction: "in"}, {Name: "needUpdate", Type: "b", Direction: "out"}}},
			{Name: "AboutToShowGroup", Args: []introspect.Arg{
				{Name: "ids", Type: "ai", Direction: "in"}, {Name: "updatesNeeded", Type: "ai", Direction: "out"}, {Name: "idErrors", Type: "ai", Direction: "out"}}},
		},
		Properties: []introspect.Property{
			{Name: "Version", Type: "u", Access: "read"},
			{Name: "TextDirection", Type: "s", Access: "read"},
			{Name: "Status", Type: "s", Access: "read"},
			{Name: "IconThemePath", Type: "as", Access: "read"},
		},
	}
)
