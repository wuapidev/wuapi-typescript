# Releasing the `wuapi` npm package

Every change to what this package ships goes to npm when it reaches `main`.
`.github/workflows/release-sdk.yml` does the publishing; you only pick the
version.

## Cutting a release

1. In your pull request, bump the version in two places to the same value:
   - `"version"` in `packages/wuapi-sdk/package.json`
   - `VERSION` in `packages/wuapi-sdk/src/core.ts` (`test/version.test.ts`
     fails when the two differ)

   We are pre-1.0 (`0.x`), so breaking changes may land in any release. By
   convention: a fix bumps the patch (`0.1.0` → `0.1.1`), anything else the
   minor (`0.1.0` → `0.2.0`). A version with a pre-release part
   (`0.2.0-beta.0`) publishes under the `next` dist-tag; any other version
   becomes `latest`.
2. Merge into `main`. The workflow typechecks, tests and builds the package,
   publishes it if npm does not have that version yet, then tags the commit
   `sdk-v<version>` and creates a GitHub Release with generated notes.

Re-running the workflow is safe: a version npm already has is skipped, and an
existing release is left alone. To run it by hand, use **Actions → Release SDK
→ Run workflow** on `main`; it is a dry run (`npm publish --dry-run`) unless you
untick `dry-run`. Runs from other branches can only be dry runs.

### What needs a bump

On pull requests the `Version bumped` check fails when any of these changed
without a version above the base branch's:

- `src/**` (becomes `dist/`), `package.json`, `README.md`, `LICENSE`
  (all shipped in the tarball)
- `tsconfig.json`, `tsconfig.build.json` (they decide the build)

Changes to `test/**`, `vitest.config.ts`, `scripts/**` and this file need no
bump. The rule is `RELEASED` in `scripts/release.mjs`; the check's message
says exactly what to change.

## One-time setup

The workflow authenticates to npm in one of two ways. Set up at least one.

**A. An npm token.** Create a granular access token on npmjs.com with
read and write access to the `wuapi` package (or, before the package exists,
to all packages of the publishing account), then add it to the repository as
the Actions secret `NPM_TOKEN` (Settings → Secrets and variables → Actions).

**B. Trusted publishing (OIDC), no long-lived secret.** On npmjs.com open the
`wuapi` package → Settings → Trusted publishing, add a GitHub Actions
publisher with:

- Organization or user: `wuapidev`
- Repository: `wuapi`
- Workflow filename: `release-sdk.yml`
- Environment: leave empty

The workflow already has `id-token: write` and updates npm to 11.5.1 or later,
which trusted publishing needs. When `NPM_TOKEN` is set it is used instead;
delete the secret once trusted publishing works.

**The first publish.** `wuapi` is not on npm yet, and trusted publishing can
only be configured on an existing package. So the first release needs either
the `NPM_TOKEN` secret (A), or a manual publish from a clean checkout of `main`:

```sh
cd packages/wuapi-sdk
npm login
npm publish --access public   # runs prepublishOnly: typecheck, test, build
```

After a manual first publish the next workflow run finds the version on npm,
skips publishing and still creates the `sdk-v<version>` tag and release. Then
configure trusted publishing (B) and drop the token.

The repository is private, so the workflow does not pass `--provenance`: npm
accepts provenance statements only from public repositories.
