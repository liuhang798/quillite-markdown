package main

import (
	"path/filepath"
	"runtime"
	"sync/atomic"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

// The Shell may ordinarily turn DeleteItem into a permanent deletion when
// the volume has no usable bin. In addition to FOFX_RECYCLEONDELETE, veto
// non-recycle transfers in PreDeleteItem. Never call DeleteFile as fallback.
var (
	trashCreate        = windows.NewLazySystemDLL("ole32.dll").NewProc("CoCreateInstance")
	trashItem          = windows.NewLazySystemDLL("shell32.dll").NewProc("SHCreateItemFromParsingName")
	trashCLSID, _      = windows.GUIDFromString("{3AD05575-8857-4850-9277-11B85BDB8E09}")
	trashOpIID, _      = windows.GUIDFromString("{947AAB5F-0A5C-4C13-B4D6-4BF7836FC9F8}")
	trashItemIID, _    = windows.GUIDFromString("{43826D1E-E718-42EE-BC55-A1E261C37BFE}")
	trashSinkIID, _    = windows.GUIDFromString("{04B0F1A7-9490-44BC-96E1-4296A31252E2}")
	trashUnknownIID, _ = windows.GUIDFromString("{00000000-0000-0000-C000-000000000046}")
)

type trashObject struct{ methods *[23]uintptr }

func (o *trashObject) release() { syscall.SyscallN(o.methods[2], uintptr(unsafe.Pointer(o))) }

type recycleSink struct {
	table    *[19]uintptr
	refs     atomic.Int32
	recycled atomic.Bool
}

// IFileOperationProgressSink, in SDK vtable order. Even unused callbacks
// have the correct argument count for Windows' 32-bit calling convention.
func recycleSinkTable() [19]uintptr {
	cb := syscall.NewCallback
	ok1 := cb(func(uintptr) uintptr { return 0 })
	ok2 := cb(func(uintptr, uintptr) uintptr { return 0 })
	ok3 := cb(func(uintptr, uintptr, uintptr) uintptr { return 0 })
	ok4 := cb(func(uintptr, uintptr, uintptr, uintptr) uintptr { return 0 })
	ok5 := cb(func(uintptr, uintptr, uintptr, uintptr, uintptr) uintptr { return 0 })
	ok6 := cb(func(uintptr, uintptr, uintptr, uintptr, uintptr, uintptr) uintptr { return 0 })
	ok7 := cb(func(uintptr, uintptr, uintptr, uintptr, uintptr, uintptr, uintptr) uintptr { return 0 })
	ok8 := cb(func(uintptr, uintptr, uintptr, uintptr, uintptr, uintptr, uintptr, uintptr) uintptr { return 0 })
	return [19]uintptr{
		cb(func(s *recycleSink, id *windows.GUID, out **recycleSink) uintptr {
			if out == nil {
				return 0x80004003
			}
			*out = nil
			if id == nil || (*id != trashSinkIID && *id != trashUnknownIID) {
				return 0x80004002
			}
			*out = s
			s.refs.Add(1)
			return 0
		}),
		cb(func(s *recycleSink) uintptr { return uintptr(s.refs.Add(1)) }),
		cb(func(s *recycleSink) uintptr { return uintptr(s.refs.Add(-1)) }),
		ok1, ok2, ok4, ok6, ok5, ok7, ok5, ok7,
		cb(func(_ *recycleSink, flags uintptr, _ uintptr) uintptr {
			if flags&0x80 == 0 {
				return 0x80004004
			} // E_ABORT unless TSF_DELETE_RECYCLE_IF_POSSIBLE
			return 0
		}),
		cb(func(s *recycleSink, _ uintptr, _ uintptr, hr uintptr, recycledItem uintptr) uintptr {
			s.recycled.Store(int32(hr) >= 0 && recycledItem != 0)
			return 0
		}),
		ok4, ok8, ok3, ok1, ok1, ok1,
	}
}

var recycleCallbacks = recycleSinkTable()

func moveDocumentToTrash(path string) error {
	// A mapped network or removable drive can have no local recycle bin.
	root, err := windows.UTF16PtrFromString(filepath.VolumeName(path) + "\\")
	if err != nil || windows.GetDriveType(root) != windows.DRIVE_FIXED {
		return errTrashUnavailable
	}
	name, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return err
	}
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	if err := windows.CoInitializeEx(0, windows.COINIT_APARTMENTTHREADED); err != nil && err != syscall.Errno(1) {
		return err
	}
	defer windows.CoUninitialize()
	sink := &recycleSink{table: &recycleCallbacks}
	sink.refs.Store(1)
	var pin runtime.Pinner
	pin.Pin(sink)
	defer pin.Unpin()
	var op, item *trashObject
	hr, _, _ := trashCreate.Call(uintptr(unsafe.Pointer(&trashCLSID)), 0, 1, uintptr(unsafe.Pointer(&trashOpIID)), uintptr(unsafe.Pointer(&op)))
	if int32(hr) < 0 || op == nil {
		return errTrashUnavailable
	}
	defer op.release()
	hr, _, _ = trashItem.Call(uintptr(unsafe.Pointer(name)), 0, uintptr(unsafe.Pointer(&trashItemIID)), uintptr(unsafe.Pointer(&item)))
	if int32(hr) < 0 || item == nil {
		return errTrashUnavailable
	}
	defer item.release()
	// FOFX_RECYCLEONDELETE | FOFX_ADDUNDORECORD | FOFX_EARLYFAILURE |
	// FOF_NOERRORUI | FOF_SILENT | FOF_NORECURSION | FOF_NO_CONNECTED_ELEMENTS.
	// Suppress a second normal confirmation; FOF_WANTNUKEWARNING overrides
	// FOF_NOCONFIRMATION for destructive prompts. The sink also vetoes those transfers.
	const flags = 0x80000 | 0x20000000 | 0x100000 | 0x400 | 0x4 | 0x1000 | 0x2000 | 0x10 | 0x4000
	hr, _, _ = syscall.SyscallN(op.methods[5], uintptr(unsafe.Pointer(op)), flags)
	if int32(hr) < 0 {
		return errTrashUnavailable
	}
	hr, _, _ = syscall.SyscallN(op.methods[18], uintptr(unsafe.Pointer(op)), uintptr(unsafe.Pointer(item)), uintptr(unsafe.Pointer(sink)))
	if int32(hr) < 0 {
		return errTrashUnavailable
	}
	hr, _, _ = syscall.SyscallN(op.methods[21], uintptr(unsafe.Pointer(op)))
	if int32(hr) < 0 {
		return errTrashUnavailable
	}
	var aborted int32
	hr, _, _ = syscall.SyscallN(op.methods[22], uintptr(unsafe.Pointer(op)), uintptr(unsafe.Pointer(&aborted)))
	if int32(hr) < 0 || aborted != 0 || !sink.recycled.Load() {
		return errTrashUnavailable
	}
	return nil
}
