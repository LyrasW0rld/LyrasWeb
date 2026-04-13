from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from markdown_it import MarkdownIt


ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "content.config.json"
OUTPUT_JSON_PATH = ROOT / "data" / "archive.json"
OUTPUT_JS_PATH = ROOT / "data" / "archive.js"
ENCODINGS = ("utf-8-sig", "utf-8", "cp1252", "latin-1")
TEXT_EXTENSIONS = {".txt", ".md"}
MAX_LATEST_ENTRIES = 8


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def read_text(path: Path) -> tuple[str, str]:
    raw_bytes = path.read_bytes()
    for encoding in ENCODINGS:
        try:
            return raw_bytes.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    return raw_bytes.decode("utf-8", errors="replace"), "utf-8-replace"


def normalize_text(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n").strip()


def slugify(value: str) -> str:
    value = normalize_slug_text(value)
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "eintrag"


def encode_path(path: str) -> str:
    return quote(path, safe="/")


def normalize_slug_text(value: str) -> str:
    normalized = value.lower().strip()
    normalized = (
        normalized.replace("ä", "ae")
        .replace("ö", "oe")
        .replace("ü", "ue")
        .replace("ß", "ss")
    )
    normalized = unicodedata.normalize("NFKD", normalized)
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    return normalized


def normalize_matching_token(value: str) -> str:
    normalized = normalize_slug_text(value)
    return re.sub(r"[^a-z0-9]+", "", normalized)


def normalize_matching_path(value: str) -> str:
    raw_parts = value.replace("\\", "/").split("/")
    tokens = [normalize_matching_token(part) for part in raw_parts if part.strip()]
    return "/".join(token for token in tokens if token)


def build_excerpt(markdown_text: str, limit: int = 180) -> str:
    first_line = next((line.strip() for line in markdown_text.splitlines() if line.strip()), "")
    compact = re.sub(r"\s+", " ", first_line)
    if len(compact) <= limit:
        return compact
    return f"{compact[: limit - 1].rstrip()}..."


def improve_markdown_display(content: str, extension: str) -> str:
    if extension == ".md":
        return content

    improved = content
    improved = re.sub(r"\[(.+?)\]", r"\n\n## \1\n\n", improved)
    improved = re.sub(r"(?<!^)(?=(\d+\.\s))", "\n\n", improved)
    improved = re.sub(r"\n{3,}", "\n\n", improved)
    return improved.strip()


def file_timestamp(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()


def file_timestamp_seconds(path: Path) -> int:
    return int(path.stat().st_mtime)


def join_slug_id(prefix: str, relative_path: Path) -> str:
    parts = [slugify(part) for part in relative_path.parts if part]
    if not parts:
        return prefix
    return f"{prefix}--{'--'.join(parts)}"


def build_audio_index(tts_directory: Path, audio_extensions: set[str]) -> dict[str, dict[str, Path | None]]:
    by_relative_stem: dict[str, Path] = {}
    by_filename_stem: dict[str, Path | None] = {}

    if not tts_directory.exists():
        return {"by_relative_stem": by_relative_stem, "by_filename_stem": by_filename_stem}

    for path in sorted((item for item in tts_directory.rglob("*") if item.is_file()), key=lambda item: item.as_posix().lower()):
        if path.suffix.lower() not in audio_extensions:
            continue

        relative_stem = normalize_matching_path(path.relative_to(tts_directory).with_suffix("").as_posix())
        filename_stem = normalize_matching_token(path.stem)

        if not relative_stem or not filename_stem:
            continue

        by_relative_stem.setdefault(relative_stem, path)
        if filename_stem in by_filename_stem and by_filename_stem[filename_stem] != path:
            by_filename_stem[filename_stem] = None
        else:
            by_filename_stem.setdefault(filename_stem, path)

    return {
        "by_relative_stem": by_relative_stem,
        "by_filename_stem": by_filename_stem,
    }


def resolve_audio_file(
    *,
    article_path: Path,
    base_directory: Path,
    audio_index: dict[str, dict[str, Path | None]],
) -> Path | None:
    relative_stem = normalize_matching_path(article_path.relative_to(base_directory).with_suffix("").as_posix())
    filename_stem = normalize_matching_token(article_path.stem)
    by_relative_stem = audio_index["by_relative_stem"]
    by_filename_stem = audio_index["by_filename_stem"]

    if relative_stem in by_relative_stem:
        return by_relative_stem[relative_stem]

    return by_filename_stem.get(filename_stem)


def build_ai_share_key(section_id: str, file_path: Path) -> str:
    # Kept stable for backward compatibility.
    return f"{section_id}--{slugify(file_path.stem)}"


def build_research_share_key(group_id: str, relative_file_path: Path) -> str:
    return join_slug_id(group_id, relative_file_path.with_suffix(""))


def build_entry_base(
    *,
    file_path: Path,
    share_key: str,
    content_kind: str,
    category_path: str,
    node_id: str | None,
    audio_file: Path | None,
) -> dict:
    extension = file_path.suffix.lower()
    relative_path = file_path.relative_to(ROOT).as_posix()
    modified_at = file_timestamp(file_path)
    modified_ts = file_timestamp_seconds(file_path)
    audio = None

    if audio_file:
        audio_relative = audio_file.relative_to(ROOT).as_posix()
        audio = {
            "filename": audio_file.name,
            "path": audio_relative,
            "url": encode_path(audio_relative),
            "extension": audio_file.suffix.lower(),
            "updated_at": file_timestamp(audio_file),
        }

    return {
        "id": share_key,
        "share_key": share_key,
        "title": file_path.stem,
        "source_filename": file_path.name,
        "source_path": relative_path,
        "source_url": encode_path(relative_path),
        "extension": extension,
        "content_kind": content_kind,
        "category_path": category_path,
        "node_id": node_id,
        "updated_at": modified_at,
        "modified_at": modified_at,
        "modified_ts": modified_ts,
        "is_new_candidate": True,
        "audio": audio,
        "has_audio": audio is not None,
    }


def enrich_entry_content(entry: dict, file_path: Path, renderer: MarkdownIt) -> dict:
    extension = file_path.suffix.lower()

    if extension in TEXT_EXTENSIONS:
        text, encoding = read_text(file_path)
        content = normalize_text(text)
        display_markdown = improve_markdown_display(content, extension)
        html = renderer.render(display_markdown).strip() or "<p>Kein Inhalt vorhanden.</p>"
        entry.update(
            {
                "preview_type": "markdown",
                "encoding": encoding,
                "description": build_excerpt(content),
                "content": content,
                "display_markdown": display_markdown,
                "content_html": html,
            }
        )
    elif extension == ".pdf":
        entry.update(
            {
                "preview_type": "pdf",
                "encoding": None,
                "description": "PDF-Dokument mit Originalansicht und Download.",
                "content": None,
                "display_markdown": None,
                "content_html": None,
            }
        )
    else:
        raise ValueError(f"Unsupported article extension: {extension}")

    return entry


def collect_ai_section(section_config: dict, renderer: MarkdownIt) -> tuple[dict, list[dict]]:
    directory = ROOT / section_config["directory"]
    extensions = {extension.lower() for extension in section_config.get("extensions", [])}
    entries: list[dict] = []

    if directory.exists():
        files = sorted(
            (path for path in directory.iterdir() if path.is_file() and path.suffix.lower() in extensions),
            key=lambda item: item.stem.lower(),
        )
        for path in files:
            share_key = build_ai_share_key(section_config["id"], path)
            entry = build_entry_base(
                file_path=path,
                share_key=share_key,
                content_kind=section_config.get("content_kind", "template"),
                category_path=section_config["label"],
                node_id=None,
                audio_file=None,
            )
            entries.append(enrich_entry_content(entry, path, renderer))

    share_keys = [entry["share_key"] for entry in entries]
    return (
        {
            "id": section_config["id"],
            "label": section_config["label"],
            "group_label": section_config.get("group_label", ""),
            "directory": section_config["directory"],
            "description": section_config.get("description", ""),
            "entry_count": len(entries),
            "entry_share_keys": share_keys,
        },
        entries,
    )


def is_excluded_path(path: Path, base_directory: Path, excluded_names: set[str]) -> bool:
    relative_parts = path.relative_to(base_directory).parts
    return any(part.lower() in excluded_names for part in relative_parts)


def prune_empty_nodes(nodes: list[dict], root_node_id: str) -> list[dict]:
    node_by_id = {node["id"]: dict(node) for node in nodes}
    has_content_cache: dict[str, bool] = {}

    def has_content(node_id: str) -> bool:
        if node_id in has_content_cache:
            return has_content_cache[node_id]

        node = node_by_id.get(node_id)
        if not node:
            has_content_cache[node_id] = False
            return False

        if node["entry_share_keys"]:
            has_content_cache[node_id] = True
            return True

        result = any(has_content(child_id) for child_id in node["child_node_ids"])
        has_content_cache[node_id] = result
        return result

    keep_ids = {node_id for node_id in node_by_id if node_id == root_node_id or has_content(node_id)}
    pruned_nodes: list[dict] = []
    for node in nodes:
        if node["id"] not in keep_ids:
            continue
        next_node = dict(node)
        next_node["child_node_ids"] = [child_id for child_id in node["child_node_ids"] if child_id in keep_ids]
        next_node["folder_count"] = len(next_node["child_node_ids"])
        pruned_nodes.append(next_node)
    return pruned_nodes


def collect_research_tree(group_config: dict, renderer: MarkdownIt) -> tuple[dict, list[dict]]:
    base_directory = ROOT / group_config["directory"]
    article_extensions = {extension.lower() for extension in group_config.get("article_extensions", [])}
    audio_extensions = {extension.lower() for extension in group_config.get("audio_extensions", [])}
    tts_directory = base_directory / group_config.get("tts_directory", "tts")
    excluded_names = {name.lower() for name in group_config.get("exclude_directories", [])}

    if not base_directory.exists():
        return (
            {
                "id": group_config["id"],
                "label": group_config["label"],
                "description": group_config.get("description", ""),
                "directory": group_config["directory"],
                "group_label": group_config.get("group_label", ""),
                "root_node_id": f"{group_config['id']}-root",
                "node_count": 0,
                "nodes": [],
            },
            [],
        )

    root_node_id = f"{group_config['id']}-root"
    nodes: list[dict] = []
    node_id_by_directory: dict[Path, str] = {base_directory: root_node_id}
    entries: list[dict] = []
    audio_index = build_audio_index(tts_directory, audio_extensions)

    all_directories = [base_directory]
    all_directories.extend(
        sorted(
            (
                path
                for path in base_directory.rglob("*")
                if path.is_dir() and not is_excluded_path(path, base_directory, excluded_names)
            ),
            key=lambda item: item.relative_to(base_directory).as_posix().lower(),
        )
    )

    for directory in all_directories:
        if directory != base_directory and is_excluded_path(directory, base_directory, excluded_names):
            continue

        relative_directory = directory.relative_to(base_directory)
        node_id = root_node_id if directory == base_directory else join_slug_id(group_config["id"], relative_directory)
        node_id_by_directory[directory] = node_id

    for directory in all_directories:
        if directory != base_directory and is_excluded_path(directory, base_directory, excluded_names):
            continue

        relative_directory = directory.relative_to(base_directory)
        node_id = node_id_by_directory[directory]
        parent_directory = directory.parent if directory != base_directory else None
        parent_id = node_id_by_directory.get(parent_directory) if parent_directory else None

        direct_subdirectories = sorted(
            (
                child
                for child in directory.iterdir()
                if child.is_dir() and not is_excluded_path(child, base_directory, excluded_names)
            ),
            key=lambda item: item.name.lower(),
        )
        child_node_ids = [node_id_by_directory[child] for child in direct_subdirectories]

        direct_files = sorted(
            (
                path
                for path in directory.iterdir()
                if path.is_file() and path.suffix.lower() in article_extensions
            ),
            key=lambda item: item.stem.lower(),
        )

        entry_share_keys: list[str] = []
        newest_ts = 0
        for file_path in direct_files:
            relative_file_path = file_path.relative_to(base_directory)
            share_key = build_research_share_key(group_config["id"], relative_file_path)
            audio_file = resolve_audio_file(article_path=file_path, base_directory=base_directory, audio_index=audio_index)
            category_path = " / ".join(relative_directory.parts) if relative_directory.parts else group_config["label"]
            entry = build_entry_base(
                file_path=file_path,
                share_key=share_key,
                content_kind=group_config.get("content_kind", "article"),
                category_path=category_path,
                node_id=node_id,
                audio_file=audio_file,
            )
            entries.append(enrich_entry_content(entry, file_path, renderer))
            entry_share_keys.append(share_key)
            newest_ts = max(newest_ts, entry["modified_ts"])

        if not newest_ts:
            timestamps = [file_timestamp_seconds(path) for path in direct_files] or [0]
            newest_ts = max(timestamps)

        label = group_config["label"] if directory == base_directory else directory.name
        path_value = relative_directory.as_posix()
        category_path = group_config["label"] if not relative_directory.parts else " / ".join(relative_directory.parts)
        node_modified_at = (
            datetime.fromtimestamp(newest_ts, tz=timezone.utc).isoformat()
            if newest_ts
            else file_timestamp(directory)
        )

        nodes.append(
            {
                "id": node_id,
                "label": label,
                "path": path_value,
                "category_path": category_path,
                "directory": directory.relative_to(ROOT).as_posix(),
                "parent_id": parent_id,
                "child_node_ids": child_node_ids,
                "entry_share_keys": entry_share_keys,
                "folder_count": len(child_node_ids),
                "entry_count": len(entry_share_keys),
                "modified_at": node_modified_at,
                "modified_ts": newest_ts,
            }
        )

    nodes = prune_empty_nodes(nodes, root_node_id)
    nodes.sort(key=lambda item: (item["path"] != "", item["path"].lower()))
    return (
        {
            "id": group_config["id"],
            "label": group_config["label"],
            "description": group_config.get("description", ""),
            "directory": group_config["directory"],
            "group_label": group_config.get("group_label", ""),
            "root_node_id": root_node_id,
            "node_count": len(nodes),
            "nodes": nodes,
        },
        entries,
    )


def build_latest_entries(entries: list[dict], limit: int = MAX_LATEST_ENTRIES) -> list[dict]:
    sorted_entries = sorted(entries, key=lambda item: item["modified_ts"], reverse=True)[:limit]
    return [
        {
            "share_key": entry["share_key"],
            "title": entry["title"],
            "description": entry["description"],
            "category_path": entry["category_path"],
            "node_id": entry["node_id"],
            "content_kind": entry["content_kind"],
            "preview_type": entry["preview_type"],
            "has_audio": entry["has_audio"],
            "modified_at": entry["modified_at"],
            "modified_ts": entry["modified_ts"],
            "source_filename": entry["source_filename"],
        }
        for entry in sorted_entries
    ]


def build_archive() -> dict:
    config = load_config()
    renderer = MarkdownIt("commonmark", {"html": False, "typographer": True}).enable("table")

    ai_sections = config.get("sections", [])
    ai_config = ai_sections[0] if ai_sections else {}
    ai_section, ai_entries = collect_ai_section(ai_config, renderer) if ai_config else ({}, [])

    research_groups = config.get("folder_groups", [])
    research_config = research_groups[0] if research_groups else {}
    research_tree, research_entries = (
        collect_research_tree(research_config, renderer) if research_config else ({}, [])
    )

    all_entries = [*ai_entries, *research_entries]
    latest_entries = build_latest_entries(all_entries)

    return {
        "site": config.get("site", {}),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "section_count": 2,
        "entry_count": len(all_entries),
        "ai_templates": ai_section,
        "research": research_tree,
        "entries": all_entries,
        "latest_entries": latest_entries,
    }


def main() -> None:
    OUTPUT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    archive = build_archive()
    archive_json = json.dumps(archive, indent=2, ensure_ascii=False)
    OUTPUT_JSON_PATH.write_text(archive_json, encoding="utf-8")
    OUTPUT_JS_PATH.write_text(f"window.__LYRA_ARCHIVE_DATA__ = {archive_json};\n", encoding="utf-8")
    print(f"Archive generated: {OUTPUT_JSON_PATH}")
    print(f"Archive script generated: {OUTPUT_JS_PATH}")


if __name__ == "__main__":
    main()
