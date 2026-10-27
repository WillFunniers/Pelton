//go:build linux

package desktop

import (
	"bufio"
	"bytes"
	"image"
	"image/color"
	"image/png"
	"os/exec"
	"strings"
	"testing"

	"github.com/godbus/dbus/v5"
)

func TestTrayMenuLayout(t *testing.T) {
	var clicked []string
	m := &trayMenu{items: []trayMenuItem{
		{label: "Open", action: func() { clicked = append(clicked, "open") }},
		{},
		{label: "Quit", action: func() { clicked = append(clicked, "quit") }},
	}}

	rev, root, derr := m.GetLayout(0, -1, nil)
	if derr != nil {
		t.Fatalf("GetLayout(0): %v", derr)
	}
	if rev != 1 || root.ID != 0 || len(root.Children) != 3 {
		t.Fatalf("root = rev %d id %d with %d children, want rev 1 id 0 with 3", rev, root.ID, len(root.Children))
	}
	tests := []struct {
		child int
		label string
		sep   bool
	}{
		{0, "Open", false},
		{1, "", true},
		{2, "Quit", false},
	}
	for _, tt := range tests {
		l := root.Children[tt.child].Value().(menuLayout)
		if l.ID != int32(tt.child+1) {
			t.Errorf("child %d id = %d, want %d", tt.child, l.ID, tt.child+1)
		}
		label, _ := l.Properties["label"].Value().(string)
		kind, _ := l.Properties["type"].Value().(string)
		if label != tt.label || (kind == "separator") != tt.sep {
			t.Errorf("child %d = label %q type %q, want label %q separator %v", tt.child, label, kind, tt.label, tt.sep)
		}
	}

	if _, shallow, _ := m.GetLayout(0, 0, nil); len(shallow.Children) != 0 {
		t.Errorf("depth 0 returned %d children, want none", len(shallow.Children))
	}
	if _, _, derr := m.GetLayout(9, -1, nil); derr == nil {
		t.Error("GetLayout(9) succeeded for a missing item")
	}
	props, _ := m.GetGroupProperties([]int32{3, 9, 1}, nil)
	if len(props) != 2 || props[0].ID != 3 || props[1].ID != 1 {
		t.Errorf("GetGroupProperties skipped the wrong ids: %+v", props)
	}

	m.Event(1, "clicked", dbus.MakeVariant(0), 0)
	m.Event(2, "clicked", dbus.MakeVariant(0), 0)
	m.Event(3, "hovered", dbus.MakeVariant(0), 0)
	m.Event(9, "clicked", dbus.MakeVariant(0), 0)
	m.EventGroup([]menuEvent{{ID: 3, EventID: "clicked"}})
	if got := len(clicked); got != 2 || clicked[0] != "open" || clicked[1] != "quit" {
		t.Errorf("clicked = %v, want [open quit]", clicked)
	}
}

func TestPixmapFromImage(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 2, 1))
	img.SetNRGBA(0, 0, color.NRGBA{R: 0x11, G: 0x22, B: 0x33, A: 0xff})
	img.SetNRGBA(1, 0, color.NRGBA{R: 0x40, G: 0x80, B: 0xc0, A: 0x80})

	pm := pixmapFromImage(img)
	if pm.Width != 2 || pm.Height != 1 {
		t.Errorf("size = %dx%d, want 2x1", pm.Width, pm.Height)
	}
	// ARGB, big-endian, straight alpha: the half-transparent pixel keeps its
	// original channel values rather than premultiplied ones.
	want := []byte{0xff, 0x11, 0x22, 0x33, 0x80, 0x40, 0x80, 0xc0}
	if !bytes.Equal(pm.Data, want) {
		t.Errorf("data = % x, want % x", pm.Data, want)
	}
}

func TestTrayToolTip(t *testing.T) {
	sni := &statusNotifier{app: newApp("test", ""), title: "Pelton"}
	if got := sni.toolTip(0); got.Title != "Pelton" || got.Description != "" {
		t.Errorf("toolTip(0) = %+v, want the title alone", got)
	}
	if got := sni.toolTip(3); got.Title != "Pelton" || got.Description != "Unread: 3" {
		t.Errorf("toolTip(3) = %+v, want the title over \"Unread: 3\"", got)
	}
}

func TestActivationTokenFollowsBusOrder(t *testing.T) {
	sni := &statusNotifier{}
	call := func(member string, body ...interface{}) *dbus.Message {
		return &dbus.Message{
			Type: dbus.TypeMethodCall,
			Headers: map[dbus.HeaderField]dbus.Variant{
				dbus.FieldInterface: dbus.MakeVariant(sniInterface),
				dbus.FieldMember:    dbus.MakeVariant(member),
			},
			Body: body,
		}
	}

	// a token for opening the context menu is never spent; the one sent for
	// the click must replace it, and a click spends exactly one token.
	sni.observe(call("ProvideXdgActivationToken", "kwin-1"))
	sni.observe(call("ProvideXdgActivationToken", "kwin-2"))
	if got := sni.takeToken(); got != "kwin-2" {
		t.Errorf("takeToken() = %q, want the newest kwin-2", got)
	}
	if got := sni.takeToken(); got != "" {
		t.Errorf("second takeToken() = %q, want the token spent", got)
	}

	// other calls, and other interfaces, must not be mistaken for a token.
	sni.observe(call("Activate", int32(1), int32(2)))
	sni.observe(&dbus.Message{Type: dbus.TypeSignal, Body: []interface{}{"kwin-3"}})
	if got := sni.takeToken(); got != "" {
		t.Errorf("takeToken() = %q after unrelated messages, want none", got)
	}
}

// privateBus starts a dbus-daemon of its own for the test, so nothing reaches
// the session bus of whoever runs it, and returns its address.
func privateBus(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("dbus-daemon"); err != nil {
		t.Skip("no dbus-daemon to run a private bus on")
	}
	cmd := exec.Command("dbus-daemon", "--session", "--nofork", "--print-address")
	out, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	})
	addr, err := bufio.NewReader(out).ReadString('\n')
	if err != nil {
		t.Fatalf("read bus address: %v", err)
	}
	return strings.TrimSpace(addr)
}

// TestSetUnreadRestoresPlainIcon reads the icon back the way a tray host does.
// prop stores a new value into the old one in place, which once wrote the
// dotted icon over the plain one, so clearing the count kept the dot.
func TestSetUnreadRestoresPlainIcon(t *testing.T) {
	addr := privateBus(t)
	dial := func() *dbus.Conn {
		conn, err := dbus.Connect(addr)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { conn.Close() })
		return conn
	}

	var frames [][]byte
	for _, size := range []int{16, 32} {
		img := image.NewNRGBA(image.Rect(0, 0, size, size))
		for i := range img.Pix {
			img.Pix[i] = 0xff
		}
		var b bytes.Buffer
		if err := png.Encode(&b, img); err != nil {
			t.Fatal(err)
		}
		frames = append(frames, b.Bytes())
	}
	a := newApp("test", "")
	a.trayIcon = buildICO(frames...)
	sni := &statusNotifier{app: a, conn: dial()}
	if err := sni.export(); err != nil {
		t.Fatal(err)
	}
	plain := append([]sniPixmap{}, sni.icon...)

	host := dial().Object(sni.conn.Names()[0], sniPath)
	read := func() ([]sniPixmap, sniToolTip) {
		t.Helper()
		var icon []sniPixmap
		var tip sniToolTip
		if err := host.StoreProperty(sniInterface+".IconPixmap", &icon); err != nil {
			t.Fatal(err)
		}
		if err := host.StoreProperty(sniInterface+".ToolTip", &tip); err != nil {
			t.Fatal(err)
		}
		return icon, tip
	}
	same := func(a, b []sniPixmap) bool {
		if len(a) != len(b) {
			return false
		}
		for i := range a {
			if a[i].Width != b[i].Width || !bytes.Equal(a[i].Data, b[i].Data) {
				return false
			}
		}
		return true
	}

	steps := []struct {
		count int
		dot   bool
		desc  string
	}{
		{3, true, "Unread: 3"},
		{0, false, ""},
		{5, true, "Unread: 5"},
		{0, false, ""},
	}
	for _, step := range steps {
		sni.setUnread(step.count)
		icon, tip := read()
		want := plain
		if step.dot {
			want = sni.dotted
		}
		if !same(icon, want) {
			t.Errorf("setUnread(%d): host sees the wrong icon, want dot %v", step.count, step.dot)
		}
		if tip.Description != step.desc {
			t.Errorf("setUnread(%d): tooltip %q, want %q", step.count, tip.Description, step.desc)
		}
	}
	if same(plain, sni.dotted) {
		t.Error("the plain and dotted icons are identical")
	}
}
