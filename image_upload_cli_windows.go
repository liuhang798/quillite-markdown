package main

import (
	"os/exec"
	"syscall"
)

func configurePicGoCLICommand(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
}
