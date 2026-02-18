# File Mover

Obsidian plugin. Two right-click actions for files:

- **Archive**: Moves file to a mirror path under `90_Archive/` (e.g., `03_Areas/Note.md` becomes `90_Archive/03_Areas/Note.md`). Hidden for files already in the archive folder.
- **Relocate**: Moves file to a path stored in a frontmatter property (default: `recommended_path`). Strips the property after moving. Validates the path (rejects `..` and absolute paths).

Confirmation dialog before each move (can be disabled in settings).

## Settings

- Archive folder name (default: `90_Archive`)
- Frontmatter property name for relocate (default: `recommended_path`)
- Confirm before move toggle (default: on)

## Build

```bash
npm install
npm run build
```

Outputs to the vault plugin folder defined in `esbuild.config.mjs`.
