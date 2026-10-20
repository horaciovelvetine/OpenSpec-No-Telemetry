# Vendored OpenSpec

Populate this directory from a verified OpenSpec-No-Telemetry build:

```bash
node scripts/vendor-openspec.mjs --from /path/to/OpenSpec-No-Telemetry/fork/out
```

The command reads `BUILD-INFO.json` (schema 2); do not rename or hardcode the tarball. It checks `SHA256SUMS`, copies all license/build sidecars, and leaves `package.json` unchanged.

Install the fork globally during your product install:

```bash
npm install -g vendor/openspec/<tarball-from-BUILD-INFO> --offline --ignore-scripts
```

The tarball carries every OpenSpec runtime dependency. Your product needs no npm dependency on the fork.
