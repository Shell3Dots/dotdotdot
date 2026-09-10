# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.5] - 2026-09-10

### Added

- **`--yes` / `-y`:** skip confirmation and run the suggested command (or task steps) non-interactively. High-risk commands still require **`--allow-dangerous`**.
- **`--allow-dangerous`:** opt in to executing high-risk commands (with `--yes`, or to enable Execute in the interactive menu).
- **Safety patterns:** `wget|curl | sh`, `iex` / `Invoke-Expression`, `find -delete`, `shutdown`/`reboot`, PowerShell `ri -Recurse`, and `eval`.
- **CI:** macOS added to the test matrix (with Linux and Windows).

### Changed

- **Non-TTY:** menus no longer auto-select the first item (previously **Execute** / **Run**). Without a TTY, the command or plan is printed and nothing runs unless `--yes` is passed.
- **`rm` classification:** medium risk requires `rm` used as a command with an argument, so substrings like `firmware` are not flagged.

### Security

- Risk analysis remains a **heuristic denylist**, not a sandbox. Always read the command before you run it.

## [1.0.4] - 2026-04-06

### Added

- **CONTRIBUTING.md** and **SECURITY.md** for contributors and responsible disclosure.
- **README:** CI status badge (default branch) next to npm.

## [1.0.3] - 2026-04-06

### Changed

- **LICENSE:** MIT copyright updated to **Shell3Dots** (2026).

### Removed

- **`postinstall` script:** No code runs at `npm install` time beyond extracting the package; the previous script only printed a welcome message.

## [1.0.2] - 2026-04-06

### Added

- **CI:** GitHub Actions workflow runs `npm test` on Linux and Windows (Node 18 and 22).
- **Releases:** Tag push (`v*`) creates a [GitHub Release](https://github.com/Shell3Dots/dotdotdot/releases) with `CHANGELOG.md` as the description and attaches the `npm pack` tarball.
- **GitHub Packages:** The same tag triggers publish of `@shell3dots/dotdotdot-cli` to GitHub’s npm registry (see repo **Packages**). Public install from npm remains `dotdotdot-cli` on npmjs.
- **Package:** `CHANGELOG.md` is included in the published npm tarball.

## [1.0.1] - 2026-04-06

### Fixed

- **Install script:** `install.sh` now runs `npm install -g dotdotdot-cli` (matches the npm package name).
- **Session file:** Session data is stored under `~/.dotdotdot/session.json` with file mode `0o600`, instead of a guessable path in the system temp directory. Legacy `dotdotdot-session.json` in temp is migrated on first run.

### Added

- **Smoke tests:** `npm test` runs checks for safety classification, provider resolution, shell helpers, and CLI parsing/exit codes (no API key or network).

### Notes

- **npm:** `npm install -g dotdotdot-cli` — primary install for most users ([npm](https://www.npmjs.com/package/dotdotdot-cli)).
- **GitHub Packages:** The same version is also published as `@shell3dots/dotdotdot-cli` on GitHub’s npm registry (see repository **Packages**). Install requires configuring `@shell3dots:registry` or using `.npmrc`; most users should prefer npm.

## [1.0.0] - 2026-04-06

Initial public release as `dotdotdot-cli` on npm.

[1.0.5]: https://github.com/Shell3Dots/dotdotdot/releases/tag/v1.0.5
[1.0.4]: https://github.com/Shell3Dots/dotdotdot/releases/tag/v1.0.4
[1.0.3]: https://github.com/Shell3Dots/dotdotdot/releases/tag/v1.0.3
[1.0.2]: https://github.com/Shell3Dots/dotdotdot/releases/tag/v1.0.2
[1.0.1]: https://github.com/Shell3Dots/dotdotdot/releases/tag/v1.0.1
