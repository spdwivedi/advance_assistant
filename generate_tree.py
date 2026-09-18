import os
from pathlib import Path

# Configured for Python & AI Agent projects
IGNORE_DIRS = {
    '.git',
    '__pycache__',
    'venv',
    '.venv',
    'env',
    'node_modules',
    '.vscode',
    '.idea',
    '.pytest_cache',
    '.mypy_cache',
    'logs'
}
IGNORE_FILES = {'.DS_Store', 'Thumbs.db', 'project_tree.txt', 'all_file_paths.txt'}

def should_ignore(path: Path, root: Path) -> bool:
    rel_path = path.relative_to(root).as_posix()
    parts = set(path.relative_to(root).parts)
    
    if any(ignored in parts for ignored in IGNORE_DIRS):
        return True
    if path.name in IGNORE_FILES:
        return True
    return False

def build_tree(dir_path: Path, root: Path, prefix: str = "") -> list:
    lines = []
    try:
        entries = sorted(
            [e for e in dir_path.iterdir() if not should_ignore(e, root)],
            key=lambda e: (not e.is_dir(), e.name.lower())
        )
    except PermissionError:
        return [f"{prefix}└── [Permission Denied]"]

    total_entries = len(entries)
    for index, entry in enumerate(entries):
        is_last = index == (total_entries - 1)
        connector = "└── " if is_last else "├── "
        lines.append(f"{prefix}{connector}{entry.name}")

        if entry.is_dir():
            extension = "    " if is_last else "│   "
            lines.extend(build_tree(entry, root, prefix + extension))
            
    return lines

def generate_file_paths(root: Path) -> list:
    flat_paths = [str(root.resolve())]
    
    for dirpath, dirnames, filenames in os.walk(root):
        current_dir = Path(dirpath)
        if should_ignore(current_dir, root):
            dirnames[:] = []
            continue

        dirnames[:] = [d for d in dirnames if not should_ignore(current_dir / d, root)]
        dirnames.sort()
        filenames.sort()

        rel_dir = current_dir.relative_to(root).as_posix()
        if rel_dir != ".":
            flat_paths.append(rel_dir)

        for filename in filenames:
            file_path = current_dir / filename
            if not should_ignore(file_path, root):
                rel_file = file_path.relative_to(root).as_posix()
                flat_paths.append(rel_file)
                
    return flat_paths

def main():
    target_input = input("Enter project folder path (press Enter for current folder): ").strip()
    root_path = Path(target_input).resolve() if target_input else Path.cwd()

    if not root_path.exists() or not root_path.is_dir():
        print(f"Error: Path '{root_path}' does not exist or is not a directory.")
        return

    print(f"\nScanning: {root_path} ...")

    tree_lines = [f"{root_path.name}/"] + build_tree(root_path, root_path)
    tree_output_file = root_path / "project_tree.txt"
    tree_output_file.write_text("\n".join(tree_lines), encoding="utf-8")

    paths_list = generate_file_paths(root_path)
    paths_output_file = root_path / "all_file_paths.txt"
    paths_output_file.write_text("\n".join(paths_list), encoding="utf-8")

    print("\nFiles generated successfully in your project root:")
    print(f"1. Tree Structure: {tree_output_file}")
    print(f"2. All File Paths: {paths_output_file}")

if __name__ == "__main__":
    main()
