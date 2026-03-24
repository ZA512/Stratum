from pathlib import Path
import re


WORKSPACE_ROOT = Path(__file__).resolve().parents[4]
ALLOWED_SKILL_ROOTS = tuple(
    root.resolve()
    for root in (
        WORKSPACE_ROOT / '.agents' / 'skills',
        WORKSPACE_ROOT / 'skills',
    )
    if root.exists()
)
SKILL_NAME_PATTERN = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')


def is_within_root(path, root):
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def resolve_path_within_workspace(raw_path, *, allow_missing=False):
    path = Path(raw_path)
    candidate = path if path.is_absolute() else WORKSPACE_ROOT / path
    resolved = candidate.resolve(strict=False)

    try:
        resolved.relative_to(WORKSPACE_ROOT)
    except ValueError as exc:
        raise ValueError(
            f"Path must stay within the current workspace: {WORKSPACE_ROOT}"
        ) from exc

    if not allow_missing and not resolved.exists():
        raise ValueError(f"Path not found: {resolved}")

    return resolved


def resolve_existing_skill_directory(raw_path):
    resolved = resolve_path_within_workspace(raw_path)

    if not resolved.is_dir():
        raise ValueError(f"Skill path must be a directory: {resolved}")

    if not any(is_within_root(resolved, root) for root in ALLOWED_SKILL_ROOTS):
        raise ValueError("Skill path must stay within an allowed skill root")

    if not (resolved / 'SKILL.md').is_file():
        raise ValueError(f"SKILL.md not found in {resolved}")

    return resolved


def resolve_skill_parent_directory(raw_path):
    resolved = resolve_path_within_workspace(raw_path)

    if not resolved.is_dir():
        raise ValueError(f"Path is not a directory: {resolved}")

    if not any(is_within_root(resolved, root) for root in ALLOWED_SKILL_ROOTS):
        raise ValueError("Skill path must stay within an allowed skill root")

    return resolved


def resolve_output_directory(raw_path):
    if raw_path is None:
        return WORKSPACE_ROOT

    raw_value = str(raw_path).strip()
    if not raw_value or raw_value in {'.', './'}:
        return WORKSPACE_ROOT

    normalized = raw_value[2:] if raw_value.startswith('./') else raw_value
    path_parts = Path(normalized).parts
    if any(part == '..' for part in path_parts):
        raise ValueError('Output directory cannot use parent traversal')

    return resolve_path_within_workspace(WORKSPACE_ROOT / Path(normalized), allow_missing=True)


def validate_skill_name(skill_name):
    if not isinstance(skill_name, str):
        raise ValueError("Skill name must be a string")

    normalized = skill_name.strip()
    if not normalized:
        raise ValueError("Skill name is required")

    if len(normalized) > 64:
        raise ValueError("Skill name must be 64 characters or fewer")

    if not SKILL_NAME_PATTERN.fullmatch(normalized):
        raise ValueError(
            "Skill name must be kebab-case with lowercase letters, digits, and hyphens only"
        )

    return normalized