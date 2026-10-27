//go:build windows || linux

package desktop

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/png"
	"os"
	"testing"
)

// buildICO packs already encoded frames into an .ico container.
func buildICO(frames ...[]byte) []byte {
	var b bytes.Buffer
	binary.Write(&b, binary.LittleEndian, []uint16{0, 1, uint16(len(frames))})
	offset := 6 + 16*len(frames)
	for _, f := range frames {
		b.Write([]byte{0, 0, 0, 0})
		binary.Write(&b, binary.LittleEndian, []uint16{1, 32})
		binary.Write(&b, binary.LittleEndian, []uint32{uint32(len(f)), uint32(offset)})
		offset += len(f)
	}
	for _, f := range frames {
		b.Write(f)
	}
	return b.Bytes()
}

// bitmapFrame encodes img the way .ico bitmap frames are stored: a
// BITMAPINFOHEADER with the doubled height, BGRA rows bottom up, then an
// all-zero AND mask.
func bitmapFrame(img *image.NRGBA, bpp uint16) []byte {
	w, h := img.Bounds().Dx(), img.Bounds().Dy()
	var b bytes.Buffer
	binary.Write(&b, binary.LittleEndian, []uint32{40, uint32(w), uint32(2 * h)})
	binary.Write(&b, binary.LittleEndian, []uint16{1, bpp})
	binary.Write(&b, binary.LittleEndian, make([]uint32, 6))
	for y := h - 1; y >= 0; y-- {
		for x := 0; x < w; x++ {
			c := img.NRGBAAt(x, y)
			b.Write([]byte{c.B, c.G, c.R, c.A})
		}
	}
	b.Write(make([]byte, h*((w+31)/32*4)))
	return b.Bytes()
}

// testFrame is a 2x2 image whose every pixel differs, so a flipped or
// channel-swapped decode shows.
func testFrame() *image.NRGBA {
	img := image.NewNRGBA(image.Rect(0, 0, 2, 2))
	img.SetNRGBA(0, 0, color.NRGBA{R: 0x11, G: 0x22, B: 0x33, A: 0xff})
	img.SetNRGBA(1, 0, color.NRGBA{R: 0x40, G: 0x80, B: 0xc0, A: 0x80})
	img.SetNRGBA(0, 1, color.NRGBA{R: 0xaa, G: 0xbb, B: 0xcc, A: 0x10})
	img.SetNRGBA(1, 1, color.NRGBA{R: 0x01, G: 0x02, B: 0x03, A: 0x00})
	return img
}

func samePixels(t *testing.T, name string, got image.Image, want *image.NRGBA) {
	t.Helper()
	if got.Bounds().Size() != want.Bounds().Size() {
		t.Fatalf("%s: size %v, want %v", name, got.Bounds().Size(), want.Bounds().Size())
	}
	gb := got.Bounds()
	for y := 0; y < want.Bounds().Dy(); y++ {
		for x := 0; x < want.Bounds().Dx(); x++ {
			g := color.NRGBAModel.Convert(got.At(gb.Min.X+x, gb.Min.Y+y)).(color.NRGBA)
			// a fully transparent pixel has no color to keep; png may drop it.
			if w := want.NRGBAAt(x, y); g != w && !(g.A == 0 && w.A == 0) {
				t.Errorf("%s: pixel %d,%d = %v, want %v", name, x, y, g, w)
			}
		}
	}
}

func TestIconFrames(t *testing.T) {
	img := testFrame()
	var pngFrame bytes.Buffer
	if err := png.Encode(&pngFrame, img); err != nil {
		t.Fatal(err)
	}
	palette := bitmapFrame(img, 8)

	frames, err := iconFrames(buildICO(pngFrame.Bytes(), palette, bitmapFrame(img, 32)))
	if err != nil {
		t.Fatal(err)
	}
	if len(frames) != 2 {
		t.Fatalf("got %d frames, want the png and the 32-bit bitmap", len(frames))
	}
	samePixels(t, "png frame", frames[0], img)
	samePixels(t, "bitmap frame", frames[1], img)

	bad := []struct {
		name string
		data []byte
	}{
		{"garbage", []byte("not an icon")},
		{"only palette bitmaps", buildICO(palette)},
		{"frame past the end", buildICO(pngFrame.Bytes())[:40]},
		{"corrupt png frame", buildICO(append(append([]byte{}, pngMagic...), "junk"...))},
		{"short bitmap header", buildICO([]byte("BM too short"))},
		{"bitmap missing its rows", buildICO(bitmapFrame(img, 32)[:48])},
	}
	for _, tt := range bad {
		if _, err := iconFrames(tt.data); err == nil {
			t.Errorf("%s decoded without error", tt.name)
		}
	}
}

func TestEncodeICORoundTrip(t *testing.T) {
	small := testFrame()
	large := image.NewNRGBA(image.Rect(0, 0, 256, 256))
	large.SetNRGBA(255, 0, color.NRGBA{R: 0xff, A: 0xff})

	data, err := encodeICO([]image.Image{small, large})
	if err != nil {
		t.Fatal(err)
	}
	// 256 does not fit the directory's size byte and is stored as 0.
	if data[6+16] != 0 || data[6+16+1] != 0 {
		t.Errorf("256px entry size bytes = %d,%d, want 0,0", data[6+16], data[6+16+1])
	}
	frames, err := iconFrames(data)
	if err != nil {
		t.Fatal(err)
	}
	if len(frames) != 2 {
		t.Fatalf("got %d frames back, want 2", len(frames))
	}
	samePixels(t, "small", frames[0], small)
	samePixels(t, "large", frames[1], large)
}

func TestWithDot(t *testing.T) {
	under := color.NRGBA{R: 0x20, G: 0x40, B: 0xe0, A: 0xff}
	for _, size := range []int{16, 22, 32, 256} {
		img := image.NewNRGBA(image.Rect(0, 0, size, size))
		for i := 0; i < len(img.Pix); i += 4 {
			copy(img.Pix[i:], []byte{under.R, under.G, under.B, under.A})
		}

		got := withDot(img)
		r := float64(size) * trayDotRadius
		ring := r + max(1, float64(size)*trayDotGap)
		cx, cy := float64(size)-r, r

		if c := got.NRGBAAt(int(cx), int(cy)); c != trayDotColor {
			t.Errorf("%dpx: dot center = %v, want %v", size, c, trayDotColor)
		}
		// halfway between the dot's edge and the ring's the icon is cut away.
		if c := got.NRGBAAt(int(cx-(r+ring)/2), int(cy)); c.A != 0 {
			t.Errorf("%dpx: ring pixel = %v, want transparent", size, c)
		}
		if c := got.NRGBAAt(0, size-1); c != under {
			t.Errorf("%dpx: far corner = %v, want the icon untouched", size, c)
		}
		if c := img.NRGBAAt(int(cx), int(cy)); c != under {
			t.Errorf("%dpx: withDot drew on its input", size)
		}
	}
}

// TestEmbeddedTrayIcons decodes the icons main.go embeds, so an icon exported
// with frames this cannot read fails here rather than as a missing tray icon.
func TestEmbeddedTrayIcons(t *testing.T) {
	for _, path := range []string{"../../build/windows/icon.ico", "../../build/windows/icon-nightly.ico"} {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		frames, err := iconFrames(data)
		if err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		sizes := map[int]bool{}
		for _, f := range frames {
			sizes[f.Bounds().Dx()] = true
		}
		// the smallest tray sizes, which a downscaled large frame renders soft.
		if !sizes[16] || !sizes[32] {
			t.Errorf("%s: frame sizes %v, want 16 and 32 among them", path, sizes)
		}
	}
}
