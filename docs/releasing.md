# Releasing @tavojs/mcp

`@tavojs/mcp` is developed in a private source repository and published from the public
[`tavojs/mcp`](https://github.com/tavojs/mcp) repository. The two repositories have separate Git
histories. Only a reviewed, allowlisted source snapshot crosses that boundary.

## Release model

- Make source changes and add Changesets in the private repository.
- Consume Changesets and validate the exact release version in the private repository.
- Export that versioned source into a branch of a clean public checkout.
- Review and merge the public pull request after CI succeeds.
- Manually run the public Release workflow to publish through npm trusted publishing.

Private-only planning documents, agent instructions, credentials, environment files, build output,
dependencies, editor configuration, and private repository references are not exported. The exporter
also rejects symbolic links, key files, token-shaped secrets, private filesystem paths, and an
unexpected public Git remote.

## Initial public repository

Export into the configured empty public checkout:

```bash
npm run export:public -- /absolute/path/to/public-mcp
cd /absolute/path/to/public-mcp
git init
git add .
git commit --signoff -m "feat: release Tavo.js MCP 1.0.0"
git branch -M main
git remote add origin git@github.com:tavojs/mcp.git
git push -u origin main
```

Review the complete exported tree before the first commit. Do not copy the private repository's
`.git` directory, branches, commits, tags, or remote configuration.

## Subsequent private-to-public syncs

Prepare and commit the release version in the private repository:

```bash
npm run version-packages
git diff -- .changeset package.json package-lock.json
git add -A .changeset package.json package-lock.json
git commit --signoff -m "chore: version package"
npm run release:check
```

Create a clean public sync branch and copy the reviewed snapshot:

```bash
cd /absolute/path/to/public-mcp
git switch main
git pull --ff-only
git switch -c sync/private-release

cd /absolute/path/to/private-mcp
npm run sync:public -- /absolute/path/to/public-mcp

cd /absolute/path/to/public-mcp
git diff --check
npm ci
npm run release:check
git add -A
git commit --signoff -m "chore: sync public release"
git push -u origin sync/private-release
```

Open a pull request in `tavojs/mcp`, review the full source diff, wait for CI, and merge it. If a
contribution lands directly in the public repository, apply that commit or patch to the private
source before the next export so the one-way snapshot does not replace it.

## Publishing

After the public sync pull request is merged, run **Actions → Release → Run workflow** from `main`.
The workflow validates, packs, audits, and checks the public documentation snapshot before invoking
Changesets. Versioning is deliberately absent from the public workflow because versions and
changelog state are prepared in the private source first.

After publication, verify the npm version and provenance, the Git tag, and the GitHub release.

For the first npm publication only, a short-lived granular npm token may be needed because npm
trusted publishers can be configured only after the package exists. Remove and revoke that token
after configuring the trusted publisher for organization `tavojs`, repository `mcp`, workflow
`release.yml`, and GitHub environment `npm`.
