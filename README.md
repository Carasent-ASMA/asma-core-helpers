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

- **Environment utilities**: Environment detection, URL helpers, domain utilities
- **Authentication**: Service authentication bindings and helpers
- **History management**: Browser history utilities
- **Type definitions**: Shared TypeScript types and enums
- **State management**: MST (MobX State Tree) helpers
- **Data utilities**: Validation, formatting, and transformation helpers

## Development

```bash
# Install dependencies
pnpm install

# Build the package
pnpm build
```

## Publishing

This package uses automated CI/CD via GitHub Actions. To publish a new version:

```bash
# Patch version (0.0.0 → 0.0.1)
git commit -m "fix: your changes --publish"

# Minor version (0.0.0 → 0.1.0)
git commit -m "feat: your feature --publish minor"

# Major version (0.0.0 → 1.0.0)
git commit -m "feat!: breaking change --publish major"
```

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

## License

MIT