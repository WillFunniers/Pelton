//go:build windows || linux

package desktop

import (
	"bytes"
	"encoding/binary"
	"errors"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math"
)

// The tray icon's unread dot is drawn onto the embedded .ico at startup rather
// than shipped as a second icon, so the dot follows the icon (and the nightly
// icon) without an asset to keep in step. Linux hands the frames to the tray
// host as pixmaps; Windows wants .ico bytes back, hence encodeICO.

// trayDotColor is the unread dot. The tray is drawn by the Go process onto a
// panel whose colour Pelton does not know, so it cannot follow the theme
// tokens; a mid gray reads on light and dark panels alike.
var trayDotColor = color.NRGBA{R: 0x8c, G: 0x8c, B: 0x8c, A: 0xff}

// trayDotRadius is the dot's radius as a fraction of the icon's size, and
// trayDotGap the ring cut out of the icon around it, so the dot stays apart
// from whatever part of the icon it lands on.
const (
	trayDotRadius = 0.22
	trayDotGap    = 0.07
)

// pngMagic starts every png stream; an .ico frame is either that or a
// headerless Windows bitmap.
var pngMagic = []byte("\x89PNG\r\n\x1a\n")

// iconFrames decodes the frames of an .ico, one image per size so a tray can
// pick the one closest to its own. Bitmap frames are only read in the 32-bit
// form both embedded icons use; older palette bitmaps are skipped.
func iconFrames(data []byte) ([]image.Image, error) {
	if len(data) < 6 || binary.LittleEndian.Uint16(data[2:]) != 1 {
		return nil, errors.New("not an icon file")
	}
	count := int(binary.LittleEndian.Uint16(data[4:]))
	var out []image.Image
	for i := 0; i < count; i++ {
		entry := 6 + i*16
		if entry+16 > len(data) {
			return nil, errors.New("truncated icon directory")
		}
		size := uint64(binary.LittleEndian.Uint32(data[entry+8:]))
		offset := uint64(binary.LittleEndian.Uint32(data[entry+12:]))
		if offset+size > uint64(len(data)) {
			return nil, errors.New("icon frame outside the file")
		}
		frame := data[offset : offset+size]
		var img image.Image
		var err error
		if bytes.HasPrefix(frame, pngMagic) {
			img, err = png.Decode(bytes.NewReader(frame))
		} else {
			img, err = decodeBitmapFrame(frame)
		}
		if err != nil {
			return nil, err
		}
		if img != nil {
			out = append(out, img)
		}
	}
	if len(out) == 0 {
		return nil, errors.New("no usable frame in icon")
	}
	return out, nil
}

// decodeBitmapFrame reads a 32-bit .ico bitmap frame: a BITMAPINFOHEADER, then
// BGRA rows bottom up, then the 1-bit AND mask, which is ignored because the
// alpha channel already says the same. The header's height counts the mask
// too, so it is twice the image's. A nil image with no error is a bitmap in a
// depth this does not read.
func decodeBitmapFrame(frame []byte) (image.Image, error) {
	if len(frame) < 40 {
		return nil, errors.New("truncated bitmap frame")
	}
	headerSize := int(binary.LittleEndian.Uint32(frame))
	w := int(int32(binary.LittleEndian.Uint32(frame[4:])))
	h := int(int32(binary.LittleEndian.Uint32(frame[8:]))) / 2
	bpp := binary.LittleEndian.Uint16(frame[14:])
	compression := binary.LittleEndian.Uint32(frame[16:])
	if bpp != 32 || compression != 0 {
		return nil, nil
	}
	if headerSize < 40 || w <= 0 || h <= 0 || w > 256 || h > 256 {
		return nil, errors.New("malformed bitmap frame")
	}
	pixels := frame[headerSize:]
	if len(pixels) < w*h*4 {
		return nil, errors.New("truncated bitmap frame")
	}
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		row := pixels[(h-1-y)*w*4:]
		for x := 0; x < w; x++ {
			p := row[x*4:]
			img.SetNRGBA(x, y, color.NRGBA{R: p[2], G: p[1], B: p[0], A: p[3]})
		}
	}
	return img, nil
}

// encodeICO packs frames into an .ico of png frames, which Windows has read
// since Vista at every size.
func encodeICO(frames []image.Image) ([]byte, error) {
	encoded := make([][]byte, len(frames))
	for i, img := range frames {
		var b bytes.Buffer
		if err := png.Encode(&b, img); err != nil {
			return nil, err
		}
		encoded[i] = b.Bytes()
	}

	var out bytes.Buffer
	_ = binary.Write(&out, binary.LittleEndian, [3]uint16{0, 1, uint16(len(frames))})
	offset := 6 + 16*len(frames)
	for i, img := range frames {
		b := img.Bounds()
		// a directory entry holds sizes in one byte, where 0 stands for 256.
		out.Write([]byte{byte(b.Dx()), byte(b.Dy()), 0, 0})
		_ = binary.Write(&out, binary.LittleEndian, [2]uint16{1, 32})
		_ = binary.Write(&out, binary.LittleEndian, [2]uint32{uint32(len(encoded[i])), uint32(offset)})
		offset += len(encoded[i])
	}
	for _, e := range encoded {
		out.Write(e)
	}
	return out.Bytes(), nil
}

// withDot returns a copy of img with the unread dot in its top right corner.
// Edges are antialiased by sampling each pixel on a 4x4 grid, which is what
// keeps the dot round at 16 pixels.
func withDot(img image.Image) *image.NRGBA {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	out := image.NewNRGBA(image.Rect(0, 0, w, h))
	draw.Draw(out, out.Bounds(), img, b.Min, draw.Src)

	size := float64(min(w, h))
	r := size * trayDotRadius
	ring := r + math.Max(1, size*trayDotGap)
	cx, cy := float64(w)-r, r

	coverage := func(x, y int, radius float64) float64 {
		inside := 0
		for sy := 0; sy < 4; sy++ {
			for sx := 0; sx < 4; sx++ {
				dx := float64(x) + (float64(sx)+0.5)/4 - cx
				dy := float64(y) + (float64(sy)+0.5)/4 - cy
				if dx*dx+dy*dy <= radius*radius {
					inside++
				}
			}
		}
		return float64(inside) / 16
	}

	for y := 0; y < min(h, int(math.Ceil(cy+ring))); y++ {
		for x := max(0, int(cx-ring)); x < w; x++ {
			dot, hole := coverage(x, y, r), coverage(x, y, ring)
			if hole == 0 {
				continue
			}
			c := out.NRGBAAt(x, y)
			under := float64(c.A) / 255 * (1 - hole)
			alpha := dot + under*(1-dot)
			if alpha == 0 {
				out.SetNRGBA(x, y, color.NRGBA{})
				continue
			}
			mix := func(d, u uint8) uint8 {
				return uint8(math.Round((float64(d)*dot + float64(u)*under*(1-dot)) / alpha))
			}
			out.SetNRGBA(x, y, color.NRGBA{
				R: mix(trayDotColor.R, c.R),
				G: mix(trayDotColor.G, c.G),
				B: mix(trayDotColor.B, c.B),
				A: uint8(math.Round(alpha * 255)),
			})
		}
	}
	return out
}
