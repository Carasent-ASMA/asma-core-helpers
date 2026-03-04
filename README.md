# asma-core-helpers

Core helper utilities for ASMA applications. This package provides shared utilities, type definitions, and helper functions used across the ASMA ecosystem.

> **Note:** This package was formerly known as `asma-helpers`. It has been renamed to `asma-core-helpers` and migrated from Bitbucket to GitHub.

## Installation

```bash
pnpm add asma-core-helpers
```

## Usage

```typescript
import { history, isAdcuris, getParamByName } from 'asma-core-helpers/lib'
import { ActorTypes, ActivityStatuses } from 'asma-core-helpers'
```

## Features

-   **Environment utilities**: Environment detection, URL helpers, domain utilities
-   **Authentication**: Service authentication bindings and helpers
-   **History management**: Browser history utilities
-   **Type definitions**: Shared TypeScript types and enums
-   **State management**: MST (MobX State Tree) helpers
-   **Data utilities**: Validation, formatting, and transformation helpers

## Development

```bash
# Install dependencies
pnpm install

# Build the package
pnpm build
```

## Publishing

This package uses automated CI/CD via GitHub Actions with conventional commit-based versioning.

**The workflow automatically analyzes your commits and publishes when it detects:**

```bash
# Patch version (0.0.0 → 0.0.1) - Bug fixes
git commit -m "fix: Resolve authentication timeout"
git commit -m "perf: Improve query performance"

# Minor version (0.0.0 → 0.1.0) - New features
git commit -m "feat: Add new utility function"
git commit -m "feat(auth): Add SSO support"

# Major version (0.0.0 → 1.0.0) - Breaking changes
git commit -m "feat!: Change API response structure"
git commit -m "fix!: Remove deprecated methods"
```

**Priority**: When multiple commits are pushed:

-   Breaking changes (`!`) → **major** version bump
-   Features (`feat:`) → **minor** version bump (if no breaking changes)
-   Fixes (`fix:`, `perf:`) → **patch** version bump (if no features or breaking changes)

**Smart Build**: The workflow intelligently skips build/publish when only documentation or configuration files change:

-   **Triggers build**: Changes to `src/`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `.npmignore`
-   **Skips build**: Changes to `README.md`, `.github/`, `.vscode/`, `.prettierrc`, `cspell.json`, etc.

**Note**: The workflow uses [conventional commit](https://www.conventionalcommits.org/) format and follows the project's commit policy (validated by lefthook pre-commit hooks).

## Migration from asma-helpers

If you're migrating from `asma-helpers`:

1. Update your `package.json`:

    ```json
    {
        "dependencies": {
            "asma-core-helpers": "^0.0.0"
        }
    }
    ```

2. Update imports in your code:

    ```typescript
    // Before
    import { ... } from 'asma-helpers'

    // After
    import { ... } from 'asma-core-helpers'
    ```

## Testing Parallel Operations

This is a test message to verify parallel AI commit message generation and git push operations work correctly with up to 20 workers. 🚀

**Update 2**: Testing after fixing GitHub workflow access and adopus-gql-directory remote URL! ✨

## License

MIT
