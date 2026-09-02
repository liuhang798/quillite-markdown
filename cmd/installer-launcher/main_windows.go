//go:build windows

package main

import (
	"bytes"
	_ "embed"
	"encoding/binary"
	"errors"
	"fmt"
	"image"
	imageDraw "image/draw"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	xdraw "golang.org/x/image/draw"
	"golang.org/x/image/webp"
	"golang.org/x/sys/windows/registry"
)

//go:embed assets/background-base.webp
var backgroundBaseWebP []byte

//go:embed assets/app-icon.webp
var appIconWebP []byte

const (
	// The artwork keeps its original 3:2 design grid so every source layer and
	// layout measurement remains pixel-perfect. The native window presents that
	// grid at two-thirds size, as requested, and downsamples the composed frame
	// once with GDI's high-quality stretch mode.
	windowWidth         = 960
	windowHeight        = 640
	displayWidth        = 640
	displayHeight       = 427
	displayCornerRadius = 28

	csHRedraw   = 0x0002
	csVRedraw   = 0x0001
	wsPopup     = 0x80000000
	wsVisible   = 0x10000000
	wsExLayered = 0x00080000

	wmDestroy     = 0x0002
	wmPaint       = 0x000F
	wmClose       = 0x0010
	wmEraseBkgnd  = 0x0014
	wmSetCursor   = 0x0020
	wmNCHitTest   = 0x0084
	wmKeyDown     = 0x0100
	wmLButtonDown = 0x0201
	wmAppRender   = 0x8001
	wmUser        = 0x0400

	htClient  = 1
	htCaption = 2
	vkEscape  = 0x1B

	dtLeft         = 0x0000
	dtCenter       = 0x0001
	dtRight        = 0x0002
	dtVCenter      = 0x0004
	dtSingleLine   = 0x0020
	dtPathEllipsis = 0x4000
	dtNoPrefix     = 0x0800
	dtWordBreak    = 0x0010

	transparent             = 1
	clearTypeNaturalQuality = 6
	srccopy                 = 0x00CC0020
	halftone                = 4
	biRGB                   = 0
	dibRGBColors            = 0
	acSrcOver               = 0
	acSrcAlpha              = 1
	ulwAlpha                = 0x00000002
	bifReturnOnlyFSDirs     = 0x0001
	bifEditBox              = 0x0010
	bifNewDialogStyle       = 0x0040
	bffmInitialized         = 1
	bffmSetSelectionW       = wmUser + 103
	coinitApartmentThreaded = 0x0002

	idcArrow = 32512
	idcHand  = 32649

	pageWelcome = iota
	pageInstalling
	pageComplete
	pageFailed
)

const payloadMagic = "QUILLITE_PAYLOAD"

const completionAutoCloseDelay = 3 * time.Second

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	gdi32    = syscall.NewLazyDLL("gdi32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	msimg32  = syscall.NewLazyDLL("msimg32.dll")

	procRegisterClassExW    = user32.NewProc("RegisterClassExW")
	procCreateWindowExW     = user32.NewProc("CreateWindowExW")
	procDefWindowProcW      = user32.NewProc("DefWindowProcW")
	procShowWindow          = user32.NewProc("ShowWindow")
	procUpdateWindow        = user32.NewProc("UpdateWindow")
	procGetMessageW         = user32.NewProc("GetMessageW")
	procTranslateMessage    = user32.NewProc("TranslateMessage")
	procDispatchMessageW    = user32.NewProc("DispatchMessageW")
	procPostQuitMessage     = user32.NewProc("PostQuitMessage")
	procDestroyWindow       = user32.NewProc("DestroyWindow")
	procPostMessageW        = user32.NewProc("PostMessageW")
	procBeginPaint          = user32.NewProc("BeginPaint")
	procEndPaint            = user32.NewProc("EndPaint")
	procGetClientRect       = user32.NewProc("GetClientRect")
	procGetWindowRect       = user32.NewProc("GetWindowRect")
	procGetCursorPos        = user32.NewProc("GetCursorPos")
	procScreenToClient      = user32.NewProc("ScreenToClient")
	procLoadCursorW         = user32.NewProc("LoadCursorW")
	procSetCursor           = user32.NewProc("SetCursor")
	procLoadIconW           = user32.NewProc("LoadIconW")
	procGetSystemMetrics    = user32.NewProc("GetSystemMetrics")
	procSetForegroundWindow = user32.NewProc("SetForegroundWindow")
	procSetWindowTextW      = user32.NewProc("SetWindowTextW")
	procDrawTextW           = user32.NewProc("DrawTextW")
	procFillRect            = user32.NewProc("FillRect")
	procUpdateLayeredWindow = user32.NewProc("UpdateLayeredWindow")
	procGetDC               = user32.NewProc("GetDC")
	procReleaseDC           = user32.NewProc("ReleaseDC")
	procSendMessageW        = user32.NewProc("SendMessageW")

	procGetModuleHandleW = kernel32.NewProc("GetModuleHandleW")

	procCreateCompatibleDC     = gdi32.NewProc("CreateCompatibleDC")
	procCreateCompatibleBitmap = gdi32.NewProc("CreateCompatibleBitmap")
	procCreateDIBSection       = gdi32.NewProc("CreateDIBSection")
	procSelectObject           = gdi32.NewProc("SelectObject")
	procDeleteObject           = gdi32.NewProc("DeleteObject")
	procDeleteDC               = gdi32.NewProc("DeleteDC")
	procStretchBlt             = gdi32.NewProc("StretchBlt")
	procSetStretchBltMode      = gdi32.NewProc("SetStretchBltMode")
	procCreateSolidBrush       = gdi32.NewProc("CreateSolidBrush")
	procSetBkMode              = gdi32.NewProc("SetBkMode")
	procSetTextColor           = gdi32.NewProc("SetTextColor")
	procCreateFontW            = gdi32.NewProc("CreateFontW")

	procAlphaBlend = msimg32.NewProc("AlphaBlend")

	shell32                 = syscall.NewLazyDLL("shell32.dll")
	ole32                   = syscall.NewLazyDLL("ole32.dll")
	procSHBrowseForFolderW  = shell32.NewProc("SHBrowseForFolderW")
	procSHGetPathFromIDList = shell32.NewProc("SHGetPathFromIDListW")
	procCoInitializeEx      = ole32.NewProc("CoInitializeEx")
	procCoUninitialize      = ole32.NewProc("CoUninitialize")
	procCoTaskMemFree       = ole32.NewProc("CoTaskMemFree")
)

type bitmapInfoHeader struct {
	size          uint32
	width         int32
	height        int32
	planes        uint16
	bitCount      uint16
	compression   uint32
	sizeImage     uint32
	xPelsPerMeter int32
	yPelsPerMeter int32
	clrUsed       uint32
	clrImportant  uint32
}

type bitmapInfo struct {
	header bitmapInfoHeader
	colors [1]uint32
}

type point struct{ x, y int32 }
type rect struct{ left, top, right, bottom int32 }

type paintStruct struct {
	hdc         uintptr
	erase       int32
	rcPaint     rect
	restore     int32
	incUpdate   int32
	rgbReserved [32]byte
}

type blendFunction struct {
	blendOp             byte
	blendFlags          byte
	sourceConstantAlpha byte
	alphaFormat         byte
}

type browseInfo struct {
	hwndOwner      uintptr
	pidlRoot       uintptr
	pszDisplayName *uint16
	lpszTitle      *uint16
	ulFlags        uint32
	lpfn           uintptr
	lParam         uintptr
	iImage         int32
}

type msg struct {
	hwnd    uintptr
	message uint32
	wParam  uintptr
	lParam  uintptr
	time    uint32
	pt      point
	private uint32
}

type wndClassEx struct {
	cbSize        uint32
	style         uint32
	lpfnWndProc   uintptr
	cbClsExtra    int32
	cbWndExtra    int32
	hInstance     uintptr
	hIcon         uintptr
	hCursor       uintptr
	hbrBackground uintptr
	lpszMenuName  *uint16
	lpszClassName *uint16
	hIconSm       uintptr
}

type installView struct {
	sync.RWMutex
	page           int
	progress       int
	errorTextZH    string
	errorTextEN    string
	installDir     string
	animationFrame int
	english        bool
	started        bool
}

type installerCopy struct {
	readyTitle         string
	readySubtitle      string
	installingTitle    string
	installingSubtitle string
	completeTitle      string
	completeSubtitle   string
	failedTitle        string
	failedFallback     string
	startAction        string
	customAction       string
	completeAction     string
	retryAction        string
	languageAction     string
	folderTitle        string
	windowTitle        string
}

type installControlState struct {
	sync.Mutex
	cancelRequested  bool
	closeAfterCancel bool
	cancelFile       string
}

type fontKey struct {
	size    int32
	weight  int32
	quality int32
	face    string
}

type rasterLayer struct {
	data      []byte
	dc        uintptr
	bitmap    uintptr
	oldBitmap uintptr
	width     int32
	height    int32
	bleedEdge bool
}

var (
	mainWindow  uintptr
	arrowCursor uintptr
	handCursor  uintptr
	// Keep the Go callback reachable for the full lifetime of the native
	// window. The Per-Monitor V2 manifest causes additional messages after
	// startup; losing the last Go reference here can leave the window hung
	// after the first garbage-collection cycle.
	windowProcCallback   uintptr
	folderBrowseCallback uintptr
	view                 = installView{page: pageWelcome}
	installControl       installControlState
	welcomePrimary       = rect{left: 357, top: 491, right: 603, bottom: 561}
	closeInstaller       = rect{left: 888, top: 24, right: 936, bottom: 72}
	customInstall        = rect{left: 42, top: 579, right: 285, bottom: 624}
	displayWelcomeAction = rect{left: 238, top: 327, right: 402, bottom: 374}
	displayClose         = rect{left: 592, top: 16, right: 624, bottom: 48}
	displayCustomInstall = rect{left: 28, top: 386, right: 190, bottom: 416}
	displayLanguage      = rect{left: 500, top: 386, right: 612, bottom: 416}
	languageAction       = rect{left: 750, top: 579, right: 918, bottom: 624}

	backDC           uintptr
	backBitmap       uintptr
	backOldBitmap    uintptr
	backWidth        int32
	backHeight       int32
	layeredDC        uintptr
	layeredBitmap    uintptr
	layeredOldBitmap uintptr
	layeredBits      unsafe.Pointer
	roundedAlphaMask []byte

	backgroundBaseLayer = rasterLayer{data: backgroundBaseWebP}
	appIconLayer        = rasterLayer{data: appIconWebP, bleedEdge: true}
	fontCache           = map[fontKey]uintptr{}
	brushCache          = map[uintptr]uintptr{}
)

func rgb(r, g, b byte) uintptr { return uintptr(r) | uintptr(g)<<8 | uintptr(b)<<16 }

func installerText(english bool) installerCopy {
	if english {
		return installerCopy{
			readyTitle:         "Ready to install Quillite Markdown",
			readySubtitle:      "Lightweight, focused, ready to use",
			installingTitle:    "Installing Quillite Markdown",
			installingSubtitle: "Please wait, installation will finish shortly",
			completeTitle:      "Installation complete",
			completeSubtitle:   "Quillite Markdown is ready",
			failedTitle:        "Installation wasn't completed",
			failedFallback:     "Check disk space or close Quillite Markdown and try again.",
			startAction:        "Start installation",
			customAction:       "Custom installation",
			completeAction:     "Finish installation",
			retryAction:        "Retry installation",
			languageAction:     "中文",
			folderTitle:        "Choose the Quillite Markdown installation folder",
			windowTitle:        "Quillite Markdown Installer",
		}
	}
	return installerCopy{
		readyTitle:         "准备安装轻阅 Markdown",
		readySubtitle:      "轻巧、专注、即刻可用",
		installingTitle:    "正在安装轻阅 Markdown",
		installingSubtitle: "请稍候，安装即将完成",
		completeTitle:      "安装完成",
		completeSubtitle:   "轻阅 Markdown 已准备就绪",
		failedTitle:        "安装没有完成",
		failedFallback:     "请检查磁盘空间或关闭正在运行的轻阅 Markdown。",
		startAction:        "开始安装",
		customAction:       "自定义安装",
		completeAction:     "完成安装",
		retryAction:        "重新安装",
		languageAction:     "English",
		folderTitle:        "选择轻阅 Markdown 的安装文件夹",
		windowTitle:        "轻阅 Markdown 安装",
	}
}

func utf16Ptr(s string) *uint16 {
	p, _ := syscall.UTF16PtrFromString(s)
	return p
}

func lowWord(v uintptr) int32  { return int32(int16(v & 0xffff)) }
func highWord(v uintptr) int32 { return int32(int16((v >> 16) & 0xffff)) }

func inside(r rect, x, y int32) bool {
	return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

func scaleToDesign(x, y, clientWidth, clientHeight int32) (int32, int32) {
	if clientWidth <= 0 || clientHeight <= 0 {
		return x, y
	}
	return int32(int64(x) * windowWidth / int64(clientWidth)),
		int32(int64(y) * windowHeight / int64(clientHeight))
}

func folderBrowseProc(hwnd uintptr, message uint32, lParam, initialPath uintptr) uintptr {
	_ = lParam
	if message == bffmInitialized && initialPath != 0 {
		procSendMessageW.Call(hwnd, bffmSetSelectionW, 1, initialPath)
	}
	return 0
}

func chooseInstallDirectory(owner uintptr, initial string, english bool) (string, bool) {
	initialPath := utf16Ptr(initial)
	title := utf16Ptr(installerText(english).folderTitle)
	var displayName [260]uint16
	info := browseInfo{
		hwndOwner:      owner,
		pszDisplayName: &displayName[0],
		lpszTitle:      title,
		ulFlags:        bifReturnOnlyFSDirs | bifEditBox | bifNewDialogStyle,
		lpfn:           folderBrowseCallback,
		lParam:         uintptr(unsafe.Pointer(initialPath)),
	}
	itemID, _, _ := procSHBrowseForFolderW.Call(uintptr(unsafe.Pointer(&info)))
	runtime.KeepAlive(initialPath)
	runtime.KeepAlive(title)
	if itemID == 0 {
		return "", false
	}
	defer procCoTaskMemFree.Call(itemID)
	var selected [260]uint16
	result, _, _ := procSHGetPathFromIDList.Call(itemID, uintptr(unsafe.Pointer(&selected[0])))
	if result == 0 {
		return "", false
	}
	normalized, err := normalizeInstallDirectory(syscall.UTF16ToString(selected[:]))
	if err != nil {
		return "", false
	}
	return normalized, true
}

func normalizeInstallDirectory(path string) (string, error) {
	path = strings.Trim(strings.TrimSpace(path), `"`)
	if path == "" {
		return "", errors.New("empty install directory")
	}
	path = filepath.Clean(path)
	if !filepath.IsAbs(path) {
		return "", errors.New("install directory must be absolute")
	}
	return path, nil
}

func main() {
	// A Win32 window and its message queue belong to the creating OS thread.
	// Pin the Go goroutine before creating either; otherwise the Go scheduler
	// may migrate the message loop during GC and Windows will mark the window
	// as not responding even though the process itself is idle.
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	if result, _, _ := procCoInitializeEx.Call(0, coinitApartmentThreaded); int32(uint32(result)) >= 0 {
		defer procCoUninitialize.Call()
	}
	view.installDir = initialInstallDirectory()
	hInstance, _, _ := procGetModuleHandleW.Call(0)
	className := utf16Ptr("QuilliteInstallerLauncher")
	title := utf16Ptr(installerText(false).windowTitle)
	hIcon, _, _ := procLoadIconW.Call(hInstance, 1)
	arrowCursor, _, _ = procLoadCursorW.Call(0, idcArrow)
	handCursor, _, _ = procLoadCursorW.Call(0, idcHand)
	windowProcCallback = syscall.NewCallback(windowProc)
	folderBrowseCallback = syscall.NewCallback(folderBrowseProc)
	wc := wndClassEx{
		cbSize:        uint32(unsafe.Sizeof(wndClassEx{})),
		style:         csHRedraw | csVRedraw,
		lpfnWndProc:   windowProcCallback,
		hInstance:     hInstance,
		hIcon:         hIcon,
		hCursor:       arrowCursor,
		lpszClassName: className,
		hIconSm:       hIcon,
	}
	if atom, _, _ := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc))); atom == 0 {
		return
	}
	screenW, _, _ := procGetSystemMetrics.Call(0)
	screenH, _, _ := procGetSystemMetrics.Call(1)
	x := (int(screenW) - displayWidth) / 2
	y := (int(screenH) - displayHeight) / 2
	hwnd, _, _ := procCreateWindowExW.Call(
		wsExLayered, uintptr(unsafe.Pointer(className)), uintptr(unsafe.Pointer(title)),
		wsPopup|wsVisible, uintptr(x), uintptr(y), displayWidth, displayHeight,
		0, 0, hInstance, 0,
	)
	if hwnd == 0 {
		return
	}
	mainWindow = hwnd
	renderLayered(hwnd)
	procShowWindow.Call(hwnd, 5)
	procUpdateWindow.Call(hwnd)
	procSetForegroundWindow.Call(hwnd)

	var message msg
	for {
		result, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&message)), 0, 0, 0)
		if int32(result) <= 0 {
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&message)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&message)))
	}
}

func windowProc(hwnd uintptr, message uint32, wParam, lParam uintptr) uintptr {
	switch message {
	case wmEraseBkgnd:
		return 1
	case wmPaint:
		paint(hwnd)
		return 0
	case wmAppRender:
		renderLayered(hwnd)
		return 0
	case wmLButtonDown:
		x, y := lowWord(lParam), highWord(lParam)
		var client rect
		procGetClientRect.Call(hwnd, uintptr(unsafe.Pointer(&client)))
		x, y = scaleToDesign(x, y, client.right, client.bottom)
		view.RLock()
		page := view.page
		installDir := view.installDir
		english := view.english
		view.RUnlock()
		if inside(languageAction, x, y) {
			english = toggleInstallerLanguage()
			windowTitle := utf16Ptr(installerText(english).windowTitle)
			procSetWindowTextW.Call(hwnd, uintptr(unsafe.Pointer(windowTitle)))
			runtime.KeepAlive(windowTitle)
			invalidateMainWindow()
			return 0
		}
		if inside(closeInstaller, x, y) {
			if page == pageInstalling {
				requestInstallExit()
			} else {
				procDestroyWindow.Call(hwnd)
			}
			return 0
		}
		if (page == pageWelcome || page == pageFailed) && inside(customInstall, x, y) {
			if selected, ok := chooseInstallDirectory(hwnd, installDir, english); ok {
				view.Lock()
				view.installDir = selected
				view.Unlock()
				beginInstall()
			}
			return 0
		}
		if inside(welcomePrimary, x, y) {
			switch page {
			case pageWelcome:
				beginInstall()
			case pageComplete:
				procDestroyWindow.Call(hwnd)
			case pageFailed:
				beginInstall()
			}
			return 0
		}
	case wmSetCursor:
		var cursor point
		if result, _, _ := procGetCursorPos.Call(uintptr(unsafe.Pointer(&cursor))); result != 0 {
			procScreenToClient.Call(hwnd, uintptr(unsafe.Pointer(&cursor)))
			view.RLock()
			page := view.page
			view.RUnlock()
			if installerClickablePoint(page, cursor.x, cursor.y) {
				procSetCursor.Call(handCursor)
				return 1
			}
		}
		procSetCursor.Call(arrowCursor)
		return 1
	case wmNCHitTest:
		x, y := lowWord(lParam), highWord(lParam)
		var wr rect
		procGetWindowRect.Call(hwnd, uintptr(unsafe.Pointer(&wr)))
		if hit := installerNonClientHitTest(x-wr.left, y-wr.top); hit != 0 {
			return hit
		}
	case wmKeyDown:
		if wParam == vkEscape {
			view.RLock()
			page := view.page
			view.RUnlock()
			if page == pageInstalling {
				requestInstallCancel()
			} else {
				procDestroyWindow.Call(hwnd)
			}
		}
		return 0
	case wmClose:
		view.RLock()
		installing := view.page == pageInstalling
		view.RUnlock()
		if installing {
			requestInstallExit()
		} else {
			procDestroyWindow.Call(hwnd)
		}
		return 0
	case wmDestroy:
		cleanupGDI()
		procPostQuitMessage.Call(0)
		return 0
	}
	result, _, _ := procDefWindowProcW.Call(hwnd, uintptr(message), wParam, lParam)
	return result
}

func toggleInstallerLanguage() bool {
	view.Lock()
	view.english = !view.english
	english := view.english
	view.Unlock()
	return english
}

func installerNonClientHitTest(x, y int32) uintptr {
	if inside(displayClose, x, y) {
		return htClient
	}
	dragHeight := int32(int64(64) * displayHeight / windowHeight)
	if y >= 0 && y < dragHeight {
		return htCaption
	}
	return 0
}

func installerClickablePoint(page int, x, y int32) bool {
	if inside(displayClose, x, y) || inside(displayLanguage, x, y) {
		return true
	}
	switch page {
	case pageWelcome, pageFailed:
		return inside(displayWelcomeAction, x, y) || inside(displayCustomInstall, x, y)
	case pageComplete:
		return inside(displayWelcomeAction, x, y)
	default:
		return false
	}
}

func paint(hwnd uintptr) {
	var ps paintStruct
	hdc, _, _ := procBeginPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
	if hdc == 0 {
		return
	}
	defer procEndPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
	renderFrame(hwnd, hdc)
}

func renderLayered(hwnd uintptr) {
	hdc, _, _ := procGetDC.Call(hwnd)
	if hdc == 0 {
		return
	}
	defer procReleaseDC.Call(hwnd, hdc)
	renderFrame(hwnd, hdc)
}

func renderFrame(hwnd, hdc uintptr) {
	ensureBackBuffer(hdc, windowWidth, windowHeight)
	memDC := backDC

	view.RLock()
	page, progress, errorTextZH, errorTextEN, animationFrame, english := view.page, view.progress, view.errorTextZH, view.errorTextEN, view.animationFrame, view.english
	view.RUnlock()
	if !drawLayeredBackdrop(memDC) {
		fill(memDC, rect{0, 0, windowWidth, windowHeight}, rgb(241, 249, 245))
	}
	ensureLayeredSurface(hdc)
	procSetStretchBltMode.Call(layeredDC, halftone)
	procStretchBlt.Call(
		layeredDC,
		0,
		0,
		displayWidth,
		displayHeight,
		memDC,
		0,
		0,
		windowWidth,
		windowHeight,
		srccopy,
	)
	drawInstaller(layeredDC, page, progress, errorTextZH, errorTextEN, animationFrame, english)
	applyRoundedAlphaMask()
	var windowRect rect
	procGetWindowRect.Call(hwnd, uintptr(unsafe.Pointer(&windowRect)))
	destination := point{x: windowRect.left, y: windowRect.top}
	size := point{x: displayWidth, y: displayHeight}
	source := point{}
	blend := blendFunction{blendOp: acSrcOver, sourceConstantAlpha: 255, alphaFormat: acSrcAlpha}
	procUpdateLayeredWindow.Call(
		hwnd,
		0,
		uintptr(unsafe.Pointer(&destination)),
		uintptr(unsafe.Pointer(&size)),
		layeredDC,
		uintptr(unsafe.Pointer(&source)),
		0,
		uintptr(unsafe.Pointer(&blend)),
		ulwAlpha,
	)
}

func drawInstaller(dc uintptr, page, progress int, errorTextZH, errorTextEN string, animationFrame int, english bool) {
	copy := installerText(english)
	title := copy.installingTitle
	subtitle := copy.installingSubtitle
	switch page {
	case pageWelcome:
		title = copy.readyTitle
		subtitle = copy.readySubtitle
	case pageComplete:
		title = copy.completeTitle
		subtitle = copy.completeSubtitle
	case pageFailed:
		title = copy.failedTitle
		errorText := errorTextZH
		if english {
			errorText = errorTextEN
		}
		if errorText == "" {
			errorText = copy.failedFallback
		}
		subtitle = errorText
	}

	drawCenteredBrand(dc, page)
	if page == pageInstalling || page == pageComplete {
		drawText(dc, title, rect{60, 221, 580, 255}, 24, 500, rgb(18, 24, 23), dtCenter|dtVCenter|dtSingleLine)
		drawText(dc, fmt.Sprintf("%d%%", progress), rect{60, 253, 580, 292}, 35, 600, rgb(0, 151, 95), dtCenter|dtVCenter|dtSingleLine)
		drawText(dc, subtitle, rect{80, 288, 560, 313}, 14, 400, rgb(35, 142, 104), dtCenter|dtVCenter|dtSingleLine)
	} else {
		drawText(dc, title, rect{60, 230, 580, 270}, 26, 500, rgb(18, 24, 23), dtCenter|dtVCenter|dtSingleLine)
		drawText(dc, subtitle, rect{80, 272, 560, 299}, 14, 400, rgb(35, 142, 104), dtCenter|dtVCenter|dtSingleLine)
	}
	switch page {
	case pageWelcome:
		drawButton(dc, displayWelcomeAction, copy.startAction, true)
		drawCustomInstallAction(dc, copy.customAction, english)
		drawCloseAction(dc)
	case pageComplete:
		drawButton(dc, displayWelcomeAction, copy.completeAction, true)
		drawCloseAction(dc)
	case pageFailed:
		drawButton(dc, displayWelcomeAction, copy.retryAction, true)
		drawCustomInstallAction(dc, copy.customAction, english)
		drawCloseAction(dc)
	case pageInstalling:
		drawButton(dc, displayWelcomeAction, installingActionLabel(animationFrame, english), true)
		drawCloseAction(dc)
	}
	drawLanguageAction(dc, copy.languageAction)
}

func drawLayeredBackdrop(dc uintptr) bool {
	return drawAlphaLayer(dc, &backgroundBaseLayer, rect{0, 0, windowWidth, windowHeight}, 255)
}

func drawCenteredBrand(dc uintptr, page int) {
	_ = page
	drawAlphaLayer(dc, &appIconLayer, rect{268, 95, 372, 199}, 255)
}

func drawAlphaLayer(dc uintptr, layer *rasterLayer, destination rect, opacity uint8) bool {
	width, height := destination.right-destination.left, destination.bottom-destination.top
	if width <= 0 || height <= 0 || !ensureRasterLayer(dc, layer, width, height) {
		return false
	}
	blend := uintptr(uint32(acSrcOver) | uint32(opacity)<<16 | uint32(acSrcAlpha)<<24)
	result, _, _ := procAlphaBlend.Call(
		dc,
		uintptr(destination.left),
		uintptr(destination.top),
		uintptr(destination.right-destination.left),
		uintptr(destination.bottom-destination.top),
		layer.dc,
		0,
		0,
		uintptr(layer.width),
		uintptr(layer.height),
		blend,
	)
	return result != 0
}

func ensureRasterLayer(referenceDC uintptr, layer *rasterLayer, targetWidth, targetHeight int32) bool {
	if layer.dc != 0 && layer.width == targetWidth && layer.height == targetHeight {
		return true
	}
	if layer.dc != 0 {
		cleanupRasterLayer(layer)
	}
	decoded, err := webp.Decode(bytes.NewReader(layer.data))
	if err != nil {
		return false
	}
	bounds := decoded.Bounds()
	if targetWidth <= 0 || targetHeight <= 0 {
		return false
	}
	width, height := int(targetWidth), int(targetHeight)
	if layer.bleedEdge {
		decoded = bleedTransparentEdges(decoded)
	}
	pixels := image.NewNRGBA(image.Rect(0, 0, width, height))
	if bounds.Dx() == width && bounds.Dy() == height {
		imageDraw.Draw(pixels, pixels.Bounds(), decoded, bounds.Min, imageDraw.Src)
	} else {
		xdraw.CatmullRom.Scale(pixels, pixels.Bounds(), decoded, bounds, imageDraw.Src, nil)
	}

	info := bitmapInfo{header: bitmapInfoHeader{
		size:        uint32(unsafe.Sizeof(bitmapInfoHeader{})),
		width:       int32(width),
		height:      -int32(height),
		planes:      1,
		bitCount:    32,
		compression: biRGB,
	}}
	var bits unsafe.Pointer
	layer.dc, _, _ = procCreateCompatibleDC.Call(referenceDC)
	layer.bitmap, _, _ = procCreateDIBSection.Call(
		referenceDC,
		uintptr(unsafe.Pointer(&info)),
		dibRGBColors,
		uintptr(unsafe.Pointer(&bits)),
		0,
		0,
	)
	if layer.dc == 0 || layer.bitmap == 0 || bits == nil {
		cleanupRasterLayer(layer)
		return false
	}
	layer.oldBitmap, _, _ = procSelectObject.Call(layer.dc, layer.bitmap)
	layer.width, layer.height = int32(width), int32(height)
	destination := unsafe.Slice((*byte)(bits), width*height*4)
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			sourceIndex := pixels.PixOffset(x, y)
			destinationIndex := (y*width + x) * 4
			alpha := uint16(pixels.Pix[sourceIndex+3])
			destination[destinationIndex] = byte(uint16(pixels.Pix[sourceIndex+2]) * alpha / 255)
			destination[destinationIndex+1] = byte(uint16(pixels.Pix[sourceIndex+1]) * alpha / 255)
			destination[destinationIndex+2] = byte(uint16(pixels.Pix[sourceIndex]) * alpha / 255)
			destination[destinationIndex+3] = byte(alpha)
		}
	}
	return true
}

func bleedTransparentEdges(source image.Image) image.Image {
	bounds := source.Bounds()
	pixels := image.NewNRGBA(image.Rect(0, 0, bounds.Dx(), bounds.Dy()))
	imageDraw.Draw(pixels, pixels.Bounds(), source, bounds.Min, imageDraw.Src)
	original := append([]byte(nil), pixels.Pix...)
	const searchRadius = 8
	for y := 0; y < pixels.Bounds().Dy(); y++ {
		for x := 0; x < pixels.Bounds().Dx(); x++ {
			index := pixels.PixOffset(x, y)
			alpha := original[index+3]
			if alpha >= 250 {
				continue
			}
			bestAlpha := alpha
			bestIndex := -1
			for radius := 1; radius <= searchRadius && bestAlpha < 240; radius++ {
				left, right := maxInt(0, x-radius), minInt(pixels.Bounds().Dx()-1, x+radius)
				top, bottom := maxInt(0, y-radius), minInt(pixels.Bounds().Dy()-1, y+radius)
				for sampleY := top; sampleY <= bottom; sampleY++ {
					for sampleX := left; sampleX <= right; sampleX++ {
						if sampleX != left && sampleX != right && sampleY != top && sampleY != bottom {
							continue
						}
						candidate := pixels.PixOffset(sampleX, sampleY)
						if original[candidate+3] > bestAlpha {
							bestAlpha = original[candidate+3]
							bestIndex = candidate
						}
					}
				}
			}
			if bestIndex >= 0 {
				pixels.Pix[index] = original[bestIndex]
				pixels.Pix[index+1] = original[bestIndex+1]
				pixels.Pix[index+2] = original[bestIndex+2]
				pixels.Pix[index+3] = alpha
			}
		}
	}
	return pixels
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func cleanupRasterLayer(layer *rasterLayer) {
	if layer.dc != 0 && layer.oldBitmap != 0 {
		procSelectObject.Call(layer.dc, layer.oldBitmap)
	}
	if layer.bitmap != 0 {
		procDeleteObject.Call(layer.bitmap)
	}
	if layer.dc != 0 {
		procDeleteDC.Call(layer.dc)
	}
	layer.dc, layer.bitmap, layer.oldBitmap = 0, 0, 0
	layer.width, layer.height = 0, 0
}

func drawCustomInstallAction(dc uintptr, label string, english bool) {
	fontSize := int32(12)
	if english {
		fontSize = 11
	}
	drawText(dc, label, displayCustomInstall, fontSize, 500, rgb(25, 126, 91), dtLeft|dtVCenter|dtSingleLine)
}

func drawLanguageAction(dc uintptr, label string) {
	drawText(dc, label, displayLanguage, 12, 500, rgb(245, 252, 249), dtRight|dtVCenter|dtSingleLine)
}

func drawCloseAction(dc uintptr) {
	drawIconText(dc, "\uE8BB", displayClose, 14, 400, rgb(57, 87, 76), dtCenter|dtVCenter|dtSingleLine)
}

func drawButton(dc uintptr, r rect, label string, primaryButton bool) {
	fillColor, borderColor, textColor := rgb(239, 246, 243), rgb(174, 204, 194), rgb(15, 132, 91)
	if primaryButton {
		fillColor, borderColor, textColor = rgb(0, 160, 99), rgb(0, 160, 99), rgb(255, 255, 255)
	}
	fillPixelRoundedRect(r, 13, borderColor)
	if fillColor != borderColor {
		fillPixelRoundedRect(rect{r.left + 1, r.top + 1, r.right - 1, r.bottom - 1}, 12, fillColor)
	}
	drawText(dc, label, r, 13, 500, textColor, dtCenter|dtVCenter|dtSingleLine)
}

func fillPixelRoundedRect(r rect, radius int32, color uintptr) {
	if layeredBits == nil || r.right <= r.left || r.bottom <= r.top || radius <= 0 {
		return
	}
	pixels := unsafe.Slice((*byte)(layeredBits), displayWidth*displayHeight*4)
	red := byte(color & 0xff)
	green := byte((color >> 8) & 0xff)
	blue := byte((color >> 16) & 0xff)
	const samples = 8
	left := max32(0, r.left-1)
	top := max32(0, r.top-1)
	right := min32(displayWidth, r.right+1)
	bottom := min32(displayHeight, r.bottom+1)
	for y := top; y < bottom; y++ {
		for x := left; x < right; x++ {
			coverage := roundedRectCoverage(x, y, r, radius, samples)
			if coverage == 0 {
				continue
			}
			index := (int(y)*int(displayWidth) + int(x)) * 4
			inverse := 255 - coverage
			pixels[index] = byte((int(blue)*coverage + int(pixels[index])*inverse) / 255)
			pixels[index+1] = byte((int(green)*coverage + int(pixels[index+1])*inverse) / 255)
			pixels[index+2] = byte((int(red)*coverage + int(pixels[index+2])*inverse) / 255)
		}
	}
}

func roundedRectCoverage(pixelX, pixelY int32, r rect, radius int32, samples int) int {
	covered := 0
	for sampleY := 0; sampleY < samples; sampleY++ {
		for sampleX := 0; sampleX < samples; sampleX++ {
			x := float64(pixelX) + (float64(sampleX)+0.5)/float64(samples)
			y := float64(pixelY) + (float64(sampleY)+0.5)/float64(samples)
			if insideRoundedRect(x, y, r, float64(radius)) {
				covered++
			}
		}
	}
	return covered * 255 / (samples * samples)
}

func insideRoundedRect(x, y float64, r rect, radius float64) bool {
	left, top, right, bottom := float64(r.left), float64(r.top), float64(r.right), float64(r.bottom)
	if x < left || x >= right || y < top || y >= bottom {
		return false
	}
	if x >= left+radius && x < right-radius || y >= top+radius && y < bottom-radius {
		return true
	}
	centerX, centerY := left+radius, top+radius
	if x >= right-radius {
		centerX = right - radius
	}
	if y >= bottom-radius {
		centerY = bottom - radius
	}
	deltaX, deltaY := x-centerX, y-centerY
	return deltaX*deltaX+deltaY*deltaY <= radius*radius
}

func min32(a, b int32) int32 {
	if a < b {
		return a
	}
	return b
}

func max32(a, b int32) int32 {
	if a > b {
		return a
	}
	return b
}

func drawText(dc uintptr, text string, r rect, size, weight int32, color uintptr, flags uint32) {
	font := getFontWithQuality(size, weight, clearTypeNaturalQuality)
	drawTextWithFont(dc, font, text, r, color, flags)
}

func drawIconText(dc uintptr, text string, r rect, size, weight int32, color uintptr, flags uint32) {
	font := getFontByName(size, weight, clearTypeNaturalQuality, "Segoe MDL2 Assets")
	drawTextWithFont(dc, font, text, r, color, flags)
}

func drawTextWithFont(dc, font uintptr, text string, r rect, color uintptr, flags uint32) {
	old, _, _ := procSelectObject.Call(dc, font)
	procSetBkMode.Call(dc, transparent)
	procSetTextColor.Call(dc, color)
	value := utf16Ptr(text)
	procDrawTextW.Call(dc, uintptr(unsafe.Pointer(value)), ^uintptr(0), uintptr(unsafe.Pointer(&r)), uintptr(flags|dtNoPrefix))
	procSelectObject.Call(dc, old)
}

func fill(dc uintptr, r rect, color uintptr) {
	brush := getBrush(color)
	procFillRect.Call(dc, uintptr(unsafe.Pointer(&r)), brush)
}

func getFontWithQuality(size, weight, quality int32) uintptr {
	return getFontByName(size, weight, quality, "Microsoft YaHei UI")
}

func getFontByName(size, weight, quality int32, face string) uintptr {
	key := fontKey{size: size, weight: weight, quality: quality, face: face}
	if font := fontCache[key]; font != 0 {
		return font
	}
	fontName := utf16Ptr(face)
	font, _, _ := procCreateFontW.Call(
		uintptr(-size), 0, 0, 0, uintptr(weight), 0, 0, 0,
		1, 0, 0, uintptr(quality), 0, uintptr(unsafe.Pointer(fontName)),
	)
	fontCache[key] = font
	return font
}

func getBrush(color uintptr) uintptr {
	if brush := brushCache[color]; brush != 0 {
		return brush
	}
	brush, _, _ := procCreateSolidBrush.Call(color)
	brushCache[color] = brush
	return brush
}

func ensureBackBuffer(hdc uintptr, width, height int32) {
	if backDC != 0 && backWidth == width && backHeight == height {
		return
	}
	if backDC != 0 {
		procSelectObject.Call(backDC, backOldBitmap)
		procDeleteObject.Call(backBitmap)
		procDeleteDC.Call(backDC)
		backDC, backBitmap, backOldBitmap = 0, 0, 0
	}
	backDC, _, _ = procCreateCompatibleDC.Call(hdc)
	backBitmap, _, _ = procCreateCompatibleBitmap.Call(hdc, uintptr(width), uintptr(height))
	backOldBitmap, _, _ = procSelectObject.Call(backDC, backBitmap)
	backWidth, backHeight = width, height
}

func ensureLayeredSurface(referenceDC uintptr) {
	if layeredDC != 0 && layeredBitmap != 0 && layeredBits != nil {
		return
	}
	info := bitmapInfo{header: bitmapInfoHeader{
		size:        uint32(unsafe.Sizeof(bitmapInfoHeader{})),
		width:       displayWidth,
		height:      -displayHeight,
		planes:      1,
		bitCount:    32,
		compression: biRGB,
	}}
	layeredDC, _, _ = procCreateCompatibleDC.Call(referenceDC)
	layeredBitmap, _, _ = procCreateDIBSection.Call(
		referenceDC,
		uintptr(unsafe.Pointer(&info)),
		dibRGBColors,
		uintptr(unsafe.Pointer(&layeredBits)),
		0,
		0,
	)
	if layeredDC == 0 || layeredBitmap == 0 || layeredBits == nil {
		return
	}
	layeredOldBitmap, _, _ = procSelectObject.Call(layeredDC, layeredBitmap)
}

func applyRoundedAlphaMask() {
	if layeredBits == nil {
		return
	}
	if len(roundedAlphaMask) != displayWidth*displayHeight {
		roundedAlphaMask = buildRoundedAlphaMask()
	}
	pixels := unsafe.Slice((*byte)(layeredBits), displayWidth*displayHeight*4)
	for pixelIndex, alpha := range roundedAlphaMask {
		index := pixelIndex * 4
		if alpha < 255 {
			pixels[index] = byte(uint16(pixels[index]) * uint16(alpha) / 255)
			pixels[index+1] = byte(uint16(pixels[index+1]) * uint16(alpha) / 255)
			pixels[index+2] = byte(uint16(pixels[index+2]) * uint16(alpha) / 255)
		}
		pixels[index+3] = alpha
	}
}

func buildRoundedAlphaMask() []byte {
	mask := make([]byte, displayWidth*displayHeight)
	const samples = 4
	for y := 0; y < displayHeight; y++ {
		for x := 0; x < displayWidth; x++ {
			coverage := 0
			for sampleY := 0; sampleY < samples; sampleY++ {
				for sampleX := 0; sampleX < samples; sampleX++ {
					px := float64(x) + (float64(sampleX)+0.5)/samples
					py := float64(y) + (float64(sampleY)+0.5)/samples
					if insideRoundedDisplay(px, py) {
						coverage++
					}
				}
			}
			mask[y*displayWidth+x] = byte(coverage * 255 / (samples * samples))
		}
	}
	return mask
}

func insideRoundedDisplay(x, y float64) bool {
	radius := float64(displayCornerRadius)
	width, height := float64(displayWidth), float64(displayHeight)
	if x < 0 || x >= width || y < 0 || y >= height {
		return false
	}
	if x >= radius && x < width-radius || y >= radius && y < height-radius {
		return true
	}
	centerX, centerY := radius, radius
	if x >= width-radius {
		centerX = width - radius
	}
	if y >= height-radius {
		centerY = height - radius
	}
	deltaX, deltaY := x-centerX, y-centerY
	return deltaX*deltaX+deltaY*deltaY <= radius*radius
}

func cleanupGDI() {
	for _, layer := range []*rasterLayer{
		&backgroundBaseLayer,
		&appIconLayer,
	} {
		cleanupRasterLayer(layer)
	}
	if backDC != 0 {
		procSelectObject.Call(backDC, backOldBitmap)
		procDeleteObject.Call(backBitmap)
		procDeleteDC.Call(backDC)
		backDC, backBitmap, backOldBitmap = 0, 0, 0
	}
	if layeredDC != 0 {
		procSelectObject.Call(layeredDC, layeredOldBitmap)
		procDeleteObject.Call(layeredBitmap)
		procDeleteDC.Call(layeredDC)
		layeredDC, layeredBitmap, layeredOldBitmap = 0, 0, 0
		layeredBits = nil
		roundedAlphaMask = nil
	}
	for _, font := range fontCache {
		procDeleteObject.Call(font)
	}
	for _, brush := range brushCache {
		procDeleteObject.Call(brush)
	}
}

func beginInstall() {
	resetInstallControl()
	view.Lock()
	if view.started && view.page == pageInstalling {
		view.Unlock()
		return
	}
	view.started = true
	view.page = pageInstalling
	view.progress = 0
	view.errorTextZH = ""
	view.errorTextEN = ""
	view.animationFrame = 0
	view.Unlock()
	invalidateMainWindow()
	go runInstallingAnimation()
	go runInstaller()
}

func runInstallingAnimation() {
	ticker := time.NewTicker(420 * time.Millisecond)
	defer ticker.Stop()
	for range ticker.C {
		view.Lock()
		if view.page != pageInstalling {
			view.Unlock()
			return
		}
		view.animationFrame++
		view.Unlock()
		invalidateMainWindow()
	}
}

func installingActionLabel(frame int, english bool) string {
	dots := []string{"...", ".", ".."}
	if frame < 0 {
		frame = 0
	}
	label := "正在安装"
	if english {
		label = "Installing"
	}
	return label + dots[frame%len(dots)]
}

func runInstaller() {
	payload, cleanup, err := extractPayload()
	if err != nil {
		setFailed(
			"安装文件不完整，请重新下载安装包。",
			"The installer package is incomplete. Download it again and retry.",
		)
		return
	}
	defer cleanup()
	if installWasCancelled() {
		setCancelled()
		return
	}
	cancelFile := filepath.Join(os.TempDir(), fmt.Sprintf("quillite-install-%d.cancel", os.Getpid()))
	_ = os.Remove(cancelFile)
	defer os.Remove(cancelFile)
	defer clearInstallControl()
	setInstallCancelFile(cancelFile)
	if installWasCancelled() {
		writeCancelMarker(cancelFile)
	}

	view.RLock()
	installDir := view.installDir
	english := view.english
	view.RUnlock()
	cmd := exec.Command(payload, installerCommandArguments(cancelFile, installDir, english)...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if err := cmd.Start(); err != nil {
		setFailed(
			"无法启动安装核心，请检查系统权限后重试。",
			"The installer core could not start. Check system permissions and retry.",
		)
		return
	}
	startedAt := time.Now()
	setInstallProgress(1)
	waitResult := make(chan error, 1)
	go func() { waitResult <- cmd.Wait() }()
	ticker := time.NewTicker(80 * time.Millisecond)
	var waitErr error
	waiting := true
	for waiting {
		select {
		case waitErr = <-waitResult:
			waiting = false
		case <-ticker.C:
			setInstallProgress(installerProgressTarget(time.Since(startedAt)))
		}
	}
	ticker.Stop()
	if waitErr != nil {
		if installWasCancelled() || installerExitCode(waitErr) == 66 {
			setCancelled()
			return
		}
		setFailed(
			"安装未完成。请关闭正在运行的轻阅 Markdown，确认磁盘空间充足后重试。",
			"Installation did not finish. Close Quillite Markdown, check disk space, and retry.",
		)
		return
	}
	animateInstallCompletion()
	view.Lock()
	view.page = pageComplete
	view.progress = 100
	view.Unlock()
	invalidateMainWindow()
	go runCompletionAutoClose()
}

func runCompletionAutoClose() {
	timer := time.NewTimer(completionAutoCloseDelay)
	defer timer.Stop()
	<-timer.C
	view.RLock()
	completed := view.page == pageComplete
	view.RUnlock()
	if completed && mainWindow != 0 {
		procPostMessageW.Call(mainWindow, wmClose, 0, 0)
	}
}

func installerCommandArguments(cancelFile, installDir string, english bool) []string {
	language := "zh-CN"
	if english {
		language = "en"
	}
	arguments := []string{"/S", "/CANCELFILE=" + cancelFile, "/APP-LANGUAGE=" + language}
	if normalized, err := normalizeInstallDirectory(installDir); err == nil {
		arguments = append(arguments, "/INSTALLDIR="+normalized)
	}
	return arguments
}

// installerProgressTarget provides a smooth waiting indicator without
// pretending the silent NSIS core exposes byte-accurate progress. It advances
// quickly through startup, then slows and stays below 100 until installation
// has actually completed successfully.
func installerProgressTarget(elapsed time.Duration) int {
	milliseconds := elapsed.Milliseconds()
	var progress int64
	switch {
	case milliseconds < 800:
		progress = 1 + milliseconds*34/800
	case milliseconds < 2500:
		progress = 35 + (milliseconds-800)*35/1700
	case milliseconds < 6000:
		progress = 70 + (milliseconds-2500)*18/3500
	default:
		progress = 88 + (milliseconds-6000)/2000
	}
	if progress > 96 {
		progress = 96
	}
	return int(progress)
}

func setInstallProgress(progress int) {
	if progress < 0 {
		progress = 0
	}
	if progress > 100 {
		progress = 100
	}
	view.Lock()
	changed := view.page == pageInstalling && progress > view.progress
	if changed {
		view.progress = progress
	}
	view.Unlock()
	if changed {
		invalidateMainWindow()
	}
}

func animateInstallCompletion() {
	view.RLock()
	start := view.progress
	view.RUnlock()
	const frames = 18
	for frame := 1; frame <= frames; frame++ {
		setInstallProgress(start + (100-start)*frame/frames)
		time.Sleep(22 * time.Millisecond)
	}
}

func resetInstallControl() {
	installControl.Lock()
	installControl.cancelRequested = false
	installControl.closeAfterCancel = false
	installControl.cancelFile = ""
	installControl.Unlock()
}

func setInstallCancelFile(path string) {
	installControl.Lock()
	installControl.cancelFile = path
	cancelRequested := installControl.cancelRequested
	installControl.Unlock()
	if cancelRequested {
		writeCancelMarker(path)
	}
}

func clearInstallControl() {
	installControl.Lock()
	installControl.cancelFile = ""
	installControl.Unlock()
}

func invalidateMainWindow() {
	if mainWindow != 0 {
		procPostMessageW.Call(mainWindow, wmAppRender, 0, 0)
	}
}

func installWasCancelled() bool {
	installControl.Lock()
	cancelRequested := installControl.cancelRequested
	installControl.Unlock()
	return cancelRequested
}

func requestInstallCancel() {
	installControl.Lock()
	if installControl.cancelRequested {
		installControl.Unlock()
		return
	}
	installControl.cancelRequested = true
	cancelFile := installControl.cancelFile
	installControl.Unlock()

	if cancelFile != "" {
		writeCancelMarker(cancelFile)
	}
}

func requestInstallExit() {
	installControl.Lock()
	installControl.closeAfterCancel = true
	installControl.Unlock()
	requestInstallCancel()
}

func writeCancelMarker(path string) {
	if path == "" {
		return
	}
	_ = os.WriteFile(path, []byte("cancel\n"), 0600)
}

func setCancelled() {
	installControl.Lock()
	closeAfterCancel := installControl.closeAfterCancel
	installControl.Unlock()
	view.Lock()
	view.page = pageWelcome
	view.progress = 0
	view.errorTextZH = ""
	view.errorTextEN = ""
	view.animationFrame = 0
	view.started = false
	view.Unlock()
	invalidateMainWindow()
	if closeAfterCancel && mainWindow != 0 {
		procPostMessageW.Call(mainWindow, wmClose, 0, 0)
	}
}

func installerExitCode(err error) int {
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return exitErr.ExitCode()
	}
	return -1
}

func setFailed(chinese, english string) {
	view.Lock()
	view.page = pageFailed
	view.progress = 0
	view.errorTextZH = chinese
	view.errorTextEN = english
	view.animationFrame = 0
	view.started = false
	view.Unlock()
	invalidateMainWindow()
}

const installerUninstallKey = `Software\Microsoft\Windows\CurrentVersion\Uninstall\Quillite Open Source轻阅 Markdown`

func preferredInstallDirectory(localAppData, recordedLocation string) string {
	recordedLocation = strings.Trim(strings.TrimSpace(recordedLocation), `"`)
	if normalized, err := normalizeInstallDirectory(recordedLocation); err == nil {
		return normalized
	}
	localAppData = strings.Trim(strings.TrimSpace(localAppData), `"`)
	if localAppData != "" {
		return filepath.Join(localAppData, "Programs", "轻阅 Markdown")
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		return filepath.Join(home, "AppData", "Local", "Programs", "轻阅 Markdown")
	}
	return `C:\Program Files\轻阅 Markdown`
}

func initialInstallDirectory() string {
	var installLocation string
	if key, err := registry.OpenKey(registry.CURRENT_USER, installerUninstallKey, registry.QUERY_VALUE); err == nil {
		installLocation, _, _ = key.GetStringValue("InstallLocation")
		_ = key.Close()
	}
	return preferredInstallDirectory(os.Getenv("LOCALAPPDATA"), installLocation)
}

func extractPayload() (string, func(), error) {
	executable, err := os.Executable()
	if err != nil {
		return "", func() {}, err
	}
	file, err := os.Open(executable)
	if err != nil {
		return "", func() {}, err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.Size() < 24 {
		return "", func() {}, errors.New("missing installer payload")
	}
	trailer := make([]byte, 24)
	if _, err := file.ReadAt(trailer, info.Size()-24); err != nil {
		return "", func() {}, err
	}
	if string(trailer[8:]) != payloadMagic {
		return "", func() {}, errors.New("invalid installer payload marker")
	}
	payloadLength := int64(binary.LittleEndian.Uint64(trailer[:8]))
	payloadOffset := info.Size() - 24 - payloadLength
	if payloadLength <= 0 || payloadOffset < 0 {
		return "", func() {}, errors.New("invalid installer payload length")
	}
	tempDir, err := os.MkdirTemp("", "quillite-installer-")
	if err != nil {
		return "", func() {}, err
	}
	cleanup := func() { _ = os.RemoveAll(tempDir) }
	target := filepath.Join(tempDir, "QuilliteMarkdown-setup-core.exe")
	out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0700)
	if err != nil {
		cleanup()
		return "", func() {}, err
	}
	if _, err = file.Seek(payloadOffset, io.SeekStart); err == nil {
		_, err = io.CopyN(out, file, payloadLength)
	}
	closeErr := out.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		cleanup()
		return "", func() {}, err
	}
	return target, cleanup, nil
}
