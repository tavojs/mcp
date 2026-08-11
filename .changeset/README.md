# Changesets

Add a changeset to every pull request that changes the published package:

```sh
npx changeset
```

Choose `@tavojs/mcp`, select the appropriate semantic version bump, and describe the user-visible change. Pull requests that do not affect the published package do not need a changeset.
