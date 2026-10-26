//go:build !windows

package main

import "os/exec"

func configurePicGoCLICommand(cmd *exec.Cmd) {}
