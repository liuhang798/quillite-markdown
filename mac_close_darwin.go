//go:build darwin

package main

/*
#cgo CFLAGS: -x objective-c -fblocks
#cgo LDFLAGS: -framework Cocoa

#import <Cocoa/Cocoa.h>
#import <dispatch/dispatch.h>
#import <objc/runtime.h>

typedef BOOL (*MDAWindowShouldCloseIMP)(id, SEL, NSWindow *);
typedef BOOL (*MDAApplicationShouldHandleReopenIMP)(id, SEL, NSApplication *, BOOL);

static MDAWindowShouldCloseIMP mdaOriginalWindowShouldClose = NULL;
static MDAApplicationShouldHandleReopenIMP mdaOriginalApplicationShouldHandleReopen = NULL;
static BOOL mdaFullscreenClosePending = NO;
static NSWindow *mdaFullscreenCloseWindow = nil;
static char mdaTrafficLightObserversKey;

static void mdaFinishFullscreenClose(NSWindow *window);
static NSWindow *mdaApplicationWindow(void);

static void mdaCenterTrafficLights(NSWindow *window) {
    if (window == nil || window.contentView == nil) {
        return;
    }

    const CGFloat titlebarHeight = 42.0;
    // FullSizeContent makes the web title bar start at the top edge of the
    // complete NSWindow, not at contentLayoutRect. Use that same edge as the
    // reference so the native controls line up with the 42 pt web toolbar.
    CGFloat targetCenterY = NSHeight(window.frame) - titlebarHeight / 2.0;
    const NSWindowButton buttonTypes[] = {
        NSWindowCloseButton,
        NSWindowMiniaturizeButton,
        NSWindowZoomButton,
    };
    for (NSUInteger index = 0; index < sizeof(buttonTypes) / sizeof(buttonTypes[0]); index++) {
        NSButton *button = [window standardWindowButton:buttonTypes[index]];
        NSView *container = button.superview;
        if (button == nil || container == nil) {
            continue;
        }
        NSRect buttonInWindow = [container convertRect:button.frame toView:nil];
        NSPoint targetInContainer = [container convertPoint:NSMakePoint(NSMidX(buttonInWindow), targetCenterY) fromView:nil];
        NSRect frame = button.frame;
        frame.origin.y = targetInContainer.y - NSHeight(frame) / 2.0;
        button.frame = frame;
    }
}

static void mdaScheduleTrafficLightCentering(NSWindow *window) {
    if (window == nil) {
        return;
    }

    // AppKit can run another private title-bar layout after resize/key/screen
    // notifications have already been delivered. Correct immediately for the
    // common case, on the next main-loop turn, and once more after the native
    // animation/layout has settled. This prevents the system default inset
    // position from replacing our 42 pt toolbar alignment after relaunch.
    mdaCenterTrafficLights(window);
    dispatch_async(dispatch_get_main_queue(), ^{
        mdaCenterTrafficLights(window);
    });
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 80 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
        mdaCenterTrafficLights(window);
    });
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 300 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
        mdaCenterTrafficLights(window);
    });
}

static void mdaInstallTrafficLightCentering(NSWindow *window) {
    mdaScheduleTrafficLightCentering(window);
    if (objc_getAssociatedObject(window, &mdaTrafficLightObserversKey) != nil) {
        return;
    }

    NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
    NSMutableArray *tokens = [NSMutableArray arrayWithCapacity:8];
    NSArray<NSNotificationName> *names = @[
        NSWindowDidResizeNotification,
        NSWindowDidEndLiveResizeNotification,
        NSWindowDidBecomeKeyNotification,
        NSWindowDidDeminiaturizeNotification,
        NSWindowDidChangeScreenNotification,
        NSWindowDidEnterFullScreenNotification,
        NSWindowDidExitFullScreenNotification,
    ];
    for (NSNotificationName name in names) {
        id token = [center addObserverForName:name object:window queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *notification) {
            mdaScheduleTrafficLightCentering(window);
            if ([notification.name isEqualToString:NSWindowDidExitFullScreenNotification]) {
                mdaFinishFullscreenClose(window);
            }
        }];
        [tokens addObject:token];
    }
    id activeToken = [center addObserverForName:NSApplicationDidBecomeActiveNotification object:NSApp queue:NSOperationQueue.mainQueue usingBlock:^(__unused NSNotification *notification) {
        mdaScheduleTrafficLightCentering(window);
    }];
    [tokens addObject:activeToken];
    objc_setAssociatedObject(window, &mdaTrafficLightObserversKey, tokens, OBJC_ASSOCIATION_RETAIN_NONATOMIC);

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 800 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
        mdaScheduleTrafficLightCentering(window);
    });
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 1600 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
        mdaScheduleTrafficLightCentering(window);
    });
}

static void mdaRefreshWindowChrome(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSWindow *window = mdaApplicationWindow();
        if (window == nil) {
            return;
        }
        mdaScheduleTrafficLightCentering(window);
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 700 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
            mdaScheduleTrafficLightCentering(window);
        });
    });
}

static BOOL mdaWindowIsFullscreen(NSWindow *window) {
    return (window.styleMask & NSWindowStyleMaskFullScreen) == NSWindowStyleMaskFullScreen;
}

static NSWindow *mdaApplicationWindow(void) {
    NSWindow *window = NSApp.mainWindow ?: NSApp.keyWindow;
    if (window != nil) {
        return window;
    }

    // A window hidden with orderOut is no longer main or key, but Wails keeps
    // the native NSWindow alive. Search the application's windows so a Dock
    // click can restore the exact same reader window.
    for (NSWindow *candidate in NSApp.windows) {
        if (candidate.canBecomeMainWindow) {
            return candidate;
        }
    }
    return nil;
}

static void mdaBringApplicationWindowToFront(NSApplication *application) {
    NSWindow *window = mdaApplicationWindow();
    if (window == nil) {
        return;
    }

    // The app may have been hidden by the standard hide-on-close behaviour or
    // by the fullscreen close workaround. Unhide it first, otherwise ordering
    // the window front keeps it invisible while the application stays hidden.
    [NSApp unhide:nil];

    if (window.miniaturized) {
        [window deminiaturize:nil];
    }

    // A window hidden right after leaving fullscreen can still carry the
    // fullscreen style mask when the close fell back to the timer path, or
    // when the exit animation was interrupted. Ordering such a window front
    // from a Dock click would keep it in the invisible fullscreen space, so
    // leave fullscreen before restoring it.
    if (mdaWindowIsFullscreen(window)) {
        [window toggleFullScreen:nil];
    }

    [window makeKeyAndOrderFront:nil];
    [application activateIgnoringOtherApps:YES];
}

static BOOL mdaApplicationShouldHandleReopen(id delegate, SEL selector, NSApplication *application, BOOL hasVisibleWindows) {
    if (mdaOriginalApplicationShouldHandleReopen != NULL) {
        mdaOriginalApplicationShouldHandleReopen(delegate, selector, application, hasVisibleWindows);
    }
    mdaBringApplicationWindowToFront(application);
    return YES;
}

static void mdaInstallApplicationReopenHandler(void) {
    id delegate = NSApp.delegate;
    if (delegate == nil) {
        return;
    }

    Class delegateClass = object_getClass(delegate);
    SEL selector = @selector(applicationShouldHandleReopen:hasVisibleWindows:);
    Method method = class_getInstanceMethod(delegateClass, selector);
    if (method != NULL && method_getImplementation(method) == (IMP)mdaApplicationShouldHandleReopen) {
        return;
    }

    const char *types = method != NULL ? method_getTypeEncoding(method) : "c@:@c";
    if (method != NULL) {
        mdaOriginalApplicationShouldHandleReopen = (MDAApplicationShouldHandleReopenIMP)method_getImplementation(method);
    }
    if (!class_addMethod(delegateClass, selector, (IMP)mdaApplicationShouldHandleReopen, types)) {
        method = class_getInstanceMethod(delegateClass, selector);
        method_setImplementation(method, (IMP)mdaApplicationShouldHandleReopen);
    }
}

static void mdaFinishFullscreenClose(NSWindow *window) {
    if (!mdaFullscreenClosePending || window == nil || window != mdaFullscreenCloseWindow) {
        return;
    }

    mdaFullscreenClosePending = NO;
    mdaFullscreenCloseWindow = nil;
    // NSWindowDidExitFullScreen is delivered after the transition completes,
    // but defer one more main-loop turn so AppKit cannot re-order the window
    // after our hide request.
    //
    // Hide only the application, exactly like the standard windowed hide-on-
    // close path. Ordering the window out as well used to leave a window that
    // had just left fullscreen attached to a stale fullscreen space, so the
    // Dock reopen (unhide + makeKeyAndOrderFront) could not bring it back.
    // Hiding the application hides its windows too, and the 3 s fallback
    // re-runs this if the first hide is lost during a transition race.
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 80 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
        [NSApp hide:nil];
    });
}

static void mdaScheduleFullscreenCloseFallback(NSWindow *window) {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 3 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        // The native notification is authoritative. This only covers an
        // interrupted animation or a notification that AppKit failed to send.
        mdaFinishFullscreenClose(window);
    });
}

static BOOL mdaWindowShouldClose(id delegate, SEL selector, NSWindow *window) {
    if (mdaFullscreenClosePending && window == mdaFullscreenCloseWindow) {
        return NO;
    }
    if (mdaWindowIsFullscreen(window)) {
        mdaFullscreenClosePending = YES;
        mdaFullscreenCloseWindow = window;
        [window toggleFullScreen:nil];
        mdaScheduleFullscreenCloseFallback(window);
        return NO;
    }
    return mdaOriginalWindowShouldClose(delegate, selector, window);
}

static void mdaInstallWindowAdjustments(NSInteger attemptsRemaining) {
    mdaInstallApplicationReopenHandler();
    NSWindow *window = NSApp.mainWindow ?: NSApp.keyWindow;
    if (window == nil) {
        if (attemptsRemaining > 0) {
            dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 50 * NSEC_PER_MSEC), dispatch_get_main_queue(), ^{
                mdaInstallWindowAdjustments(attemptsRemaining - 1);
            });
        }
        return;
    }

    mdaInstallTrafficLightCentering(window);
    id delegate = window.delegate;
    if (delegate == nil) {
        return;
    }

    Class delegateClass = object_getClass(delegate);
    SEL selector = @selector(windowShouldClose:);
    Method method = class_getInstanceMethod(delegateClass, selector);
    if (method == NULL || method_getImplementation(method) == (IMP)mdaWindowShouldClose) {
        return;
    }

    mdaOriginalWindowShouldClose = (MDAWindowShouldCloseIMP)method_getImplementation(method);
    method_setImplementation(method, (IMP)mdaWindowShouldClose);
}

static void mdaInstallFullscreenCloseWorkaround(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        mdaInstallWindowAdjustments(20);
    });
}

static void mdaPerformClose(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSWindow *window = NSApp.mainWindow ?: NSApp.keyWindow;
        if (window != nil) {
            [window performClose:nil];
        }
    });
}
*/
import "C"

func installMacFullscreenCloseWorkaround() {
	C.mdaInstallFullscreenCloseWorkaround()
}

func closeMacWindow() {
	C.mdaPerformClose()
}

func refreshMacWindowChrome() {
	C.mdaRefreshWindowChrome()
}
