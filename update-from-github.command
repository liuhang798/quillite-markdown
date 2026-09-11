#!/bin/zsh

set -u
cd "${0:A:h}" || exit 1

finish() {
  local code="$1"
  echo
  [[ -t 0 ]] && read -r "?按回车键关闭窗口..."
  exit "$code"
}

fail() {
  echo "[错误] $1"
  finish 1
}

echo "========================================"
echo "  轻阅 Markdown - 安全更新本地代码"
echo "========================================"
echo "项目目录：$PWD"
echo
echo "此操作只执行快进更新，不会删除或覆盖本地改动。"
echo

command -v git >/dev/null 2>&1 || fail "未找到 Git。请先运行：xcode-select --install"
[[ -d .git ]] || fail "当前目录不是 Git 仓库。"

branch="$(git branch --show-current)"
[[ -n "$branch" ]] || fail "当前处于 detached HEAD 状态。"
git remote get-url origin >/dev/null 2>&1 || fail "未配置 origin 远程仓库。"

if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "[停止] 检测到本地改动，未下载任何内容："
  git status --short
  fail "请先提交、暂存或自行处理这些文件后再更新。"
fi

echo
echo "[1/3] 获取远程最新代码..."
git fetch --prune origin "$branch" || fail "获取远程代码失败，请检查网络或 GitHub 登录状态。"
git show-ref --verify --quiet "refs/remotes/origin/$branch" || fail "远程不存在 origin/$branch。"

echo "[2/3] 仅执行快进更新..."
git merge --ff-only "origin/$branch" || fail "本地与远程历史已分叉；未覆盖文件，请手动处理提交。"

echo "[3/3] 更新完成。"
git log -1 --oneline
finish 0
