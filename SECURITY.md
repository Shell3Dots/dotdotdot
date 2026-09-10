# Security

Command risk checks (`lib/safety.js`) are a **heuristic denylist**, not a sandbox or policy engine. They flag common destructive patterns (`rm -rf`, `sudo`, `curl | bash`, and similar) so the CLI can warn, block auto-exec, and require `--allow-dangerous` for high-risk `--yes` runs. Models can still produce commands that bypass those patterns. Do not pipe untrusted output into a shell, and do not use `--yes --allow-dangerous` on untrusted prompts.

Non-interactive use: without a TTY, **nothing is executed** unless you pass **`--yes`**. High-risk commands still need **`--allow-dangerous`**.

If you discover a security vulnerability in this project, please report it privately by opening a **security advisory** on [GitHub](https://github.com/Shell3Dots/dotdotdot/security/advisories/new) or by contacting the maintainers through the contact options listed on the repository. Do not file public issues for undisclosed vulnerabilities. We will work with you to understand and address the report; please allow reasonable time for a fix before public disclosure.
