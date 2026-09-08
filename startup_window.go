package main

// startupRect uses signed desktop coordinates: secondary monitors may be to
// the left of or above the primary monitor. All values use the same DPI space.
type startupRect struct {
	left, top, right, bottom int32
}

func fitStartupWindow(window, work startupRect, dpi int) startupRect {
	if work.right <= work.left || work.bottom <= work.top {
		return window
	}
	if dpi <= 0 {
		dpi = 96
	}
	margin := int32(16 * dpi / 96)
	availableW, availableH := work.right-work.left, work.bottom-work.top
	// Keep a modest gap without making extremely small desktops unusable.
	gapX, gapY := min(margin, availableW/20), min(margin, availableH/20)
	w := min(max(1, window.right-window.left), availableW-2*gapX)
	h := min(max(1, window.bottom-window.top), availableH-2*gapY)
	x, y := work.left+(availableW-w)/2, work.top+(availableH-h)/2
	return startupRect{x, y, x + w, y + h}
}
