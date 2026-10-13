# Vendored OpenSpec

Populate this directory from a verified OpenSpec-No-Telemetry build:

```bash
node scripts/vendor-openspec.mjs --from /path/to/OpenSpec-No-Telemetry/fork/out
npm ci --offline
```

The command reads `BUILD-INFO.json`; do not rename or hardcode the tarball. It
checks `SHA256SUMS`, copies all license/build sidecars, updates `package.json`,
and generates `package-lock.json`. The tarball carries every OpenSpec
dependency, so both lockfile generation and installation need no registry.
