# Contributing

Thanks for taking the time to help with the wuapi TypeScript SDK.

## This repository is a mirror

The SDK is developed in the wuapi monorepo, next to the API it talks to, and
every change is copied here automatically. Nobody commits to this repository
directly: the next sync would refuse to run.

## Issues

Issues are welcome. Bug reports, missing endpoints, confusing types or docs:
open an issue here. A short snippet that reproduces the problem, the SDK
version and your runtime (Node, Bun, Deno or an edge runtime, with its
version) help a lot.

## Pull requests

You can open a pull request here too. We don't merge it in this repository:
a maintainer ports the change to the monorepo, credits you as co-author, and
it comes back here with the next sync. Your pull request is closed with a
link to the commit that shipped it.

Before you open one:

```sh
npm install
npm run typecheck
npm test
npm run build
```

Keep changes small and focused. For anything larger than a fix, open an issue
first so we can agree on the shape of the API.

## Security

Please don't open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).
