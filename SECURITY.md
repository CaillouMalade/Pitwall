# Security

The current 3.x preview is maintained. Use a recent release and the locked dependencies from `npm ci`.

The desktop app bundles Electron with sandboxing, context isolation, no renderer Node integration, no IPC bridge, denied permission requests and an allowlist for external HTTPS links. Packaged runtime fuses disable Node execution/environment options, CLI inspection and loading code outside the verified ASAR archive. Its profile is separate from ordinary browsers. Mac previews are ad-hoc signed and not notarized unless built by the credential-backed release workflow; Windows previews are unsigned and can be blocked by Windows security policies.

Pitwall serves built files on loopback only. It has no account system, backend or API keys. The local server rejects foreign hostnames, blocks framing and restricts scripts, images and connections to the weather and map services with a content security policy. Error messages shown in the app are fixed text and never include request URLs.

Never put credentials in browser code or `VITE_` variables. Provider responses are untrusted data and are validated before use.

For a non-sensitive bug, open a GitHub issue with reproduction steps and versions. For a vulnerability, do not post the details publicly: use GitHub's private vulnerability reporting if the Security tab offers it. Otherwise open a minimal issue requesting a private channel, with no exploit or personal data attached.

CI runs a redacted Gitleaks scan of reachable history, dependency auditing and read-only build/browser checks. GitHub Actions dependencies are pinned to commit hashes.
