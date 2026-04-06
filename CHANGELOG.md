# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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

[1.0.2]: https://github.com/Shell3Dots/dotdotdot/releases/tag/v1.0.2
[1.0.1]: https://github.com/Shell3Dots/dotdotdot/releases/tag/v1.0.1
