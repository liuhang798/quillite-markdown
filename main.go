package main

import (
	"embed"
	"fmt"
	goruntime "runtime"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// In-app update helper mode: performs the binary replacement and restart
	// without starting the GUI (see updater_windows.go).
	runUpdateHelperIfRequested()

	app := NewApp()
	applicationMenu := buildApplicationMenu(goruntime.GOOS)

	err := wails.Run(&options.App{
		Title:             appNameZH,
		Width:             1440,
		Height:            920,
		MinWidth:          920,
		MinHeight:         620,
		Frameless:         goruntime.GOOS != "darwin",
		HideWindowOnClose: hideWindowOnClose(goruntime.GOOS),
		Menu:              applicationMenu,
		AssetServer:       &assetserver.Options{Assets: assets},
		BackgroundColour:  &options.RGBA{R: 246, G: 244, B: 239, A: 255},
		OnStartup:         app.startup,
		StartHidden:       goruntime.GOOS == "windows",
		OnDomReady:        startupWindowReady(),
		OnBeforeClose:     app.beforeClose,
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId:               "com.liuhang.quillite-markdown",
			OnSecondInstanceLaunch: app.onSecondInstanceLaunch,
		},
		DragAndDrop: &options.DragAndDrop{EnableFileDrop: true, DisableWebViewDrop: false},
		Windows: &windows.Options{
			Theme: windows.SystemDefault, DisableFramelessWindowDecorations: false,
			IsZoomControlEnabled: false, DisablePinchZoom: true,
		},
		// The inset native title bar gives AppKit a real 42 pt toolbar region, so
		// the traffic lights remain vertically centred after activation, resize,
		// Spaces changes, and fullscreen transitions.
		Mac:  &mac.Options{TitleBar: mac.TitleBarHiddenInset(), OnFileOpen: app.onFileOpen},
		Bind: []interface{}{app},
	})
	if err != nil {
		fmt.Println("Error:", err)
	}
}

func buildApplicationMenu(platform string) *menu.Menu {
	if platform != "darwin" {
		return nil
	}
	applicationMenu := menu.NewMenu()
	applicationMenu.Append(menu.AppMenu()) // Includes the conventional Command+Q quit action.
	fileMenu := applicationMenu.AddSubmenu("File")
	fileMenu.AddText("Close Window", keys.CmdOrCtrl("w"), func(_ *menu.CallbackData) {
		closeMacWindow()
	})
	applicationMenu.Append(menu.EditMenu())
	return applicationMenu
}

func hideWindowOnClose(platform string) bool {
	return platform == "darwin"
}
