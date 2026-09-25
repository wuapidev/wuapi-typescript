# Releasing the `@wuapidev/sdk` npm package

The SDK is developed in the wuapi monorepo (`packages/wuapi-sdk`) and
published from its public mirror,
[wuapidev/wuapi-typescript](https://github.com/wuapidev/wuapi-typescript).
Every change to what the package ships goes to npm when it reaches `main`;
you only pick the version.

```
monorepo PR (bump the version)
  -> merge into wuapidev/wuapi main
  -> sync-sdk-typescript.yml pushes the folder to wuapidev/wuapi-typescript main
  -> its release.yml publishes to npm with provenance, tags v<version>, creates a GitHub Release
```

## Cutting a release

1. In your monorepo pull request, bump the version in two places to the same
   value:
   - `"version"` in `packages/wuapi-sdk/package.json`
   - `VERSION` in `packages/wuapi-sdk/src/core.ts` (`test/version.test.ts`
     fails when the two differ)

   We are pre-1.0 (`0.x`), so breaking changes may land in any release. By
   convention: a fix bumps the patch (`0.1.0` → `0.1.1`), anything else the
   minor (`0.1.0` → `0.2.0`). A version with a pre-release part
   (`0.2.0-beta.0`) publishes under the `next` dist-tag; any other version
   becomes `latest`.
2. Merge into `main`. `.github/workflows/sync-sdk-typescript.yml` mirrors
   `packages/wuapi-sdk` to `wuapidev/wuapi-typescript`, where
   `.github/workflows/release.yml` (this folder's `.github/`, at that
   repository's root) typechecks, tests and builds the package, publishes it
   with `npm publish --provenance` if npm does not have that version yet, then
   creates the `v<version>` tag and a GitHub Release with generated notes.

Re-running the release is safe: a version npm already has is skipped, and an
existing release is left alone. To run it by hand, open **Actions → Release →
Run workflow** in wuapi-typescript on `main`; it is a dry run
(`npm publish --dry-run`) unless you untick `dry-run`. Runs from other
branches can only be dry runs.

Never commit to wuapi-typescript directly: the sync stops when that
repository's `main` has commits it did not push (see "When the sync stops").

### What needs a bump

On monorepo pull requests the `Version bumped` check
(`.github/workflows/sdk-version.yml`) fails when any of these changed without
a version above the base branch's:

- `src/**` (becomes `dist/`), `package.json`, `README.md`, `LICENSE`
  (all shipped in the tarball)
- `tsconfig.json`, `tsconfig.build.json` (they decide the build)

Changes to `test/**`, `vitest.config.ts`, `scripts/**`, `.github/**`,
`CONTRIBUTING.md`, `SECURITY.md` and this file need no bump; they sync to
wuapi-typescript and publish nothing. The rule is `RELEASED` in
`scripts/release.mjs`; the check's message says exactly what to change.

## How the sync works

`sync-sdk-typescript.yml` runs on every push to the monorepo's `main` that
touches `packages/wuapi-sdk/**` (and by hand), one run at a time. It runs
`git subtree split --prefix=packages/wuapi-sdk` and hands the result to
`scripts/sync-sdk.sh`, which never force-pushes:

- Splits are deterministic: the same history gives the same commits. When
  wuapi-typescript's `main` is an ancestor of the new split (merge-commit
  merges, and every normal sync), the split is pushed as a fast-forward and
  the SDK repository gets the monorepo's commits one for one.
- A squash or rebase merge rewrites the monorepo's commits, so the new split
  no longer descends from what was pushed. The script then pushes one join
  commit on top of wuapi-typescript's `main`: its tree is exactly the
  monorepo's `packages/wuapi-sdk`, its parents are the previous `main` and the
  new split. Still a fast-forward.
- It records what it pushed in the ref `refs/mirror/last-sync` of
  wuapi-typescript, in the same atomic push as `main`.

### When the sync stops

If wuapi-typescript's `main` is not `refs/mirror/last-sync`, someone
committed there directly, and the sync fails with "SDK repository diverged"
without pushing. Port the change to the monorepo and merge it, then mark the
SDK repository's `main` as synced and re-run the workflow:

```sh
git fetch git@github.com:wuapidev/wuapi-typescript.git main
git push git@github.com:wuapidev/wuapi-typescript.git FETCH_HEAD:refs/mirror/last-sync
```

The next sync joins `main` to the monorepo's folder with one commit.

## One-time setup

Done once per SDK repository. Steps 1 and 2 are done for wuapi-typescript;
step 3 needs the `wuapihq` npm account.

1. **The SDK repository.** `wuapidev/wuapi-typescript`, public, populated
   with `git subtree split --prefix=packages/wuapi-sdk` of the monorepo.
2. **The sync token.** A fine-grained personal access token with resource
   owner `wuapidev`, access to `wuapi-typescript` only, and **Contents** and
   **Workflows** read and write. It is the monorepo's Actions secret
   `SDK_TYPESCRIPT_TOKEN`. A deploy key is not enough: GitHub refuses a push
   that changes `.github/workflows/` without the workflows permission. The
   token expires, so renew it before then:

   ```sh
   gh secret set SDK_TYPESCRIPT_TOKEN -R wuapidev/wuapi   # prompts for the new token
   ```

   The repository must let this push through: its "no force pushes or
   deletion" rule is fine; a rule requiring status checks on `main` is not,
   because CI runs after the sync pushes.
3. **npm trusted publishing (OIDC).** No npm token exists anywhere. On
   npmjs.com, signed in as `wuapihq`, open `@wuapidev/sdk` → Settings →
   Trusted publishing and set the GitHub Actions publisher to:
   - Organization or user: `wuapidev`
   - Repository: `wuapi-typescript`
   - Workflow filename: `release.yml`
   - Environment: leave empty

   Remove any older publisher that points at `wuapidev/wuapi` /
   `release-sdk.yml`. `release.yml` has `id-token: write`, runs Node 24 and
   updates npm to 11.5.1 or later, which trusted publishing needs. Because
   wuapi-typescript is public, npm also records a provenance statement for
   each version, linking it to the commit and the workflow run. Provenance
   needs `repository.url` in `package.json` to be this repository, which it is.

   Once trusted publishing works, you can also set the package's publishing
   access to "Require two-factor authentication and disallow tokens".

## Adding another language

A new SDK (Python, Go, ...) follows the same shape: a folder in the monorepo
with its own `.github/workflows/` (CI and release), a public repository named
`wuapidev/wuapi-<language>`, a token with access to it as `SDK_<LANGUAGE>_TOKEN`,
and a copy of `sync-sdk-typescript.yml` with its own prefix, remote and
concurrency group. `scripts/sync-sdk.sh` is shared.
