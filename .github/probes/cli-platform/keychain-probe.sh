#!/usr/bin/env bash
# macOS only. Puts a fake Claude Code sign-in in the keychain under the name
# Claude Code uses for ~/.claude, then asks `claude auth status` once with
# the default folder and once with CLAUDE_CONFIG_DIR set to an empty folder.
# The token is made up and never leaves the runner.
set -u
keychain="$RUNNER_TEMP/probe.keychain-db"
security create-keychain -p probe "$keychain"
security unlock-keychain -p probe "$keychain"
security set-keychain-settings "$keychain"
security list-keychains -d user -s "$keychain" $(security list-keychains -d user | tr -d '"')
security default-keychain -d user -s "$keychain"
expires=$(( ($(date +%s) + 86400) * 1000 ))
fake="{\"claudeAiOauth\":{\"accessToken\":\"fake-probe-token\",\"refreshToken\":\"fake-probe-refresh\",\"expiresAt\":$expires,\"scopes\":[\"user:inference\",\"user:profile\"],\"subscriptionType\":\"pro\"}}"
security add-generic-password -U -a "${USER:-$(id -un)}" -s "Claude Code-credentials" -w "$fake" "$keychain"
mkdir -p "$HOME/.claude"
empty="$(mktemp -d)"
show() { grep -E '"(loggedIn|authMethod|configDirectory)"' | sed "s#$HOME#~#; s#$empty#<empty temp folder>#"; }
echo "### Claude Code $(claude --version): auth status with the default folder (~/.claude)"
env -u ANTHROPIC_API_KEY -u CLAUDE_CODE_OAUTH_TOKEN -u CLAUDE_CONFIG_DIR claude auth status | show; echo "exit code: ${PIPESTATUS[0]}"
echo "### auth status with CLAUDE_CONFIG_DIR=<empty temp folder>"
env -u ANTHROPIC_API_KEY -u CLAUDE_CODE_OAUTH_TOKEN CLAUDE_CONFIG_DIR="$empty" claude auth status | show; echo "exit code: ${PIPESTATUS[0]}"
echo "### Files in the empty folder afterwards"; ls -A "$empty"
echo "### Keychain entries named Claude Code* afterwards"
security dump-keychain "$keychain" | grep -o '"svce"<blob>="Claude Code[^"]*"' | sort -u
security delete-keychain "$keychain"
