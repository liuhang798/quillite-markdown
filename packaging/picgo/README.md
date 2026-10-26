# Private PicGo CLI component

The desktop app embeds only `package.json` and `package-lock.json`, not Node or
`node_modules`. `PreparePicGoCLI` downloads the pinned Node archive from
`nodejs.org`, verifies its compiled SHA-256, extracts Node/npm into a new private
directory and runs that Node with npm's CLI directly (no shell).

`npm ci` uses this reviewed lockfile, `registry.npmjs.org`, SHA-512 integrity,
empty user/global npm configuration, a private cache, `--ignore-scripts`,
`--bin-links=false`, no audit/funding requests and no automatic fetch retries.
System Node, PATH and global npm configuration are not changed. Downloads are
explicit opt-in; they are not application updates and never contact our website.

Review dependency sources, integrity values and lifecycle scripts whenever
updating the lockfile. Do not substitute a mirror or resolve `latest` at runtime.
Node archive digests are pinned in `image_upload_cli_prepare.go`; update and
verify all supported platforms together. Keep dependency/runtime license files.

Opt-in acceptance: set `QUILLITE_PICGO_PREPARE_TEST_DIR` to an absolute isolated
directory under `D:\工作\CodexTemp`, set TEMP/TMP to a dedicated test directory,
then run `go test -run 'TestPicGoOfficial' -count=1 -v`.
This downloads real official components, verifies Windows CLI startup on a
Windows host, and checks macOS/Linux archives without claiming native execution.
No image upload, user configuration changes or production website deployment are
part of this test. Successful component test outputs are retained for inspection.
