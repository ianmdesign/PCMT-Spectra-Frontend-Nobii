#!/usr/bin/env python3
"""Build a path-preserving replacement-file ZIP for PCMT Spectra (excluding live comms).

Run from the root of an existing ianmdesign/PCMT-Spectra-Frontend-Nobii checkout:
    python build_pcmt_spectra_update.py /path/to/PCMT-Spectra-Frontend-Nobii

The checkout is NOT modified. The generated ZIP contains only changed/new files.
"""
from __future__ import annotations

import argparse
import re
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

GITHUB_FORK_HEAD = "fd321a88781e5ec1c331fd8d0b93b6cea4db3a95"
GITHUB_UPSTREAM_HEAD = "3f82fd7b013f04ed84c2d20fece83f52ffd2560e"


def require(value: bool, message: str) -> None:
    if not value:
        raise RuntimeError(message)


def exactly_once(source: str, old: str, new: str, path: str) -> str:
    if new in source and old not in source:
        return source  # idempotent when already patched
    count = source.count(old)
    require(count == 1, f"{path}: expected precisely one marker; found {count}: {old[:90]!r}")
    return source.replace(old, new, 1)


def modify_agent_names(src: str, path: str) -> str:
    require('"Paprika" = "Hush"' in src, f"{path}: Hush not yet present in fork")
    require('"Aggrobot" = "Gekko"' in src and '"AggroBot" = "Gekko"' in src,
            f"{path}: expected the fork's dual Gekko aliases")
    # Asset filenames for both spellings will be available; reverse lookups should prefer canonical spelling.
    src = src.replace('  "Aggrobot" = "Gekko",\n  "AggroBot" = "Gekko",',
                      '  "AggroBot" = "Gekko",\n  "Aggrobot" = "Gekko",', 1)
    return src


def modify_agent_select_test(src: str, path: str) -> str:
    src = exactly_once(src, '    "Pandemic",\n    "Phoenix",',
                       '    "Pandemic",\n    "Paprika",\n    "Phoenix",', path)
    src = src.replace('    "Aggrobot",', '    "AggroBot",', 1)
    # Change the same sample player that Nobii changed, without overwriting PCMT sample data.
    match = re.search(r'(fullName: "Testg#ABC",[\s\S]*?agentInternal: ")Wushu("\s*,)', src)
    if match:
        src = src[:match.start()] + match.group(1) + 'Paprika' + match.group(2) + src[match.end():]
    else:
        require('fullName: "Testg#ABC"' in src and 'agentInternal: "Paprika"' in src,
                f"{path}: couldn't locate Nobii's Hush test player")
    return src


def modify_test_match(src: str, path: str) -> str:
    match = re.search(r'(fullName: "Fourcefield#DEBUG",[\s\S]*?agentInternal: ")Killjoy("\s*,)', src)
    if match:
        return src[:match.start()] + match.group(1) + 'Paprika' + match.group(2) + src[match.end():]
    require('fullName: "Fourcefield#DEBUG"' in src and 'agentInternal: "Paprika"' in src,
            f"{path}: could not identify default match testing agent")
    return src


def modify_language_aliases(src: str, path: str) -> str:
    old = '''  static LanguageAliases: Record<string, string> = {
    jp: "ja",
    zh_CN: "zh_HANS",
  };'''
    new = '''  // Keys are lowercase because the lang param is lowercased before lookup.
  static LanguageAliases: Record<string, string> = {
    jp: "ja",
    zh_cn: "zh_HANS",
    zh_hans: "zh_HANS",
    zh_tw: "zh_HANT",
    zh_hant: "zh_HANT",
  };'''
    src = exactly_once(src, old, new, path)
    src = exactly_once(src, 'return this.LanguageAliases[alias] || alias;',
                       'return this.LanguageAliases[alias.toLowerCase()] || alias;', path)
    return src


def modify_data_model(src: str, path: str) -> str:
    old = '''      this.translate.use(this.language());
      this.hideAuxiliary.set'''
    new = '''      this.translate.use(this.language());
      // Use the active locale for CJK font fallbacks, including Chinese variants.
      document.documentElement.lang = this.language().replace("_", "-");
      this.hideAuxiliary.set'''
    return exactly_once(src, old, new, path)


def cjk_font_faces() -> str:
    lines = []
    for locale in ("JP", "KR", "SC"):
        for weight, file_weight in ((400, "Regular"), (500, "Medium"), (700, "Bold")):
            lines += [
                "@font-face {",
                f'  font-family: "Noto Sans {locale}";',
                f"  font-weight: {weight};",
                f'  src: url("/assets/fonts/NotoSansMono/NotoSans{locale}-{file_weight}.ttf") format("truetype");',
                "}",
            ]
    return "\n".join(lines) + "\n"


def modify_styles(src: str, path: str) -> str:
    # This is an additive merge into PCMT's stylesheet. Its post-match colours are untouched.
    tc_import = '@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap");\n'
    if tc_import not in src:
        pattern = '@import url("https://fonts.googleapis.com/css2?family=Unbounded:wght@200..900&display=swap");\n'
        src = exactly_once(src, pattern, pattern + tc_import, path)
    if 'font-family: "Noto Sans JP";' not in src:
        require('@font-face {' in src, f'{path}: existing font declarations missing')
        src = src.replace('@font-face {', cjk_font_faces() + '@font-face {', 1)

    fallbacks = '''/* Latin glyphs keep the branded fonts; use Noto Sans for CJK glyphs. */
:root {
  --font-cjk: "Noto Sans SC";
}
:root:lang(ja) {
  --font-cjk: "Noto Sans JP";
}
:root:lang(ko) {
  --font-cjk: "Noto Sans KR";
}
:root:lang(zh-Hant) {
  --font-cjk: "Noto Sans TC", "Noto Sans SC";
}

'''
    if '--font-cjk:' not in src:
        src = exactly_once(src, '@utility font-montserrat {',
                           fallbacks + '@utility font-montserrat {', path)
    families = [
        'Montserrat', 'Unbounded',
        '"DIN Next W1G Light"', '"DIN Next W1G Regular"',
        '"DIN Next W1G Medium"', '"DIN Next W1G Bold"',
        '"DIN Condensed"', '"Foundry Gridnik W03 Bold"',
        '"Foundry Gridnik W03 Extra Bold"', 'Replica', 'Tungsten',
    ]
    for family in families:
        old = f'font-family: {family}, Helvetica;'
        new = f'font-family: {family}, var(--font-cjk), Helvetica;'
        require(old in src or new in src, f"{path}: expected style for {family}")
        src = src.replace(old, new)
    require('--color-postmatch-primary: #18c3cb;' in src,
            f'{path}: expected PCMT post-match colour (refusing wholesale upstream overwrite)')
    return src


def make_zip(repo: Path, out: Path) -> list[str]:
    require((repo / 'src/app/services/agentName.service.ts').is_file(),
            'Point the script at the root of your PCMT Spectra fork checkout.')
    require((repo / 'public/assets/agents/PaprikaIcon.webp').is_file(),
            'The October 27 Hush assets are missing; update your fork checkout first.')

    text_modifications = {
        'src/app/services/agentName.service.ts': modify_agent_names,
        'src/app/overlays/testing-agent-select/testing-agent-select.component.ts': modify_agent_select_test,
        'src/app/overlays/testing/testing.component.ts': modify_test_match,
        'src/app/services/i18nHelper.ts': modify_language_aliases,
        'src/app/services/dataModel.service.ts': modify_data_model,
        'src/styles.css': modify_styles,
    }
    changed: dict[str, bytes] = {}
    for path, transform in text_modifications.items():
        filepath = repo / path
        require(filepath.is_file(), f'Missing required file: {path}')
        original = filepath.read_text(encoding='utf-8')
        updated = transform(original, path)
        if original != updated:
            changed[path] = updated.encode('utf-8')

    for part in ('ability1/AggroBotAbility1.webp', 'ability2/AggroBotAbility2.webp',
                 'agent-portraits/AggroBotPortrait.webp', 'agents/AggroBotIcon.webp',
                 'grenades/AggroBotGrenade.webp', 'ultimates/AggroBotUltimate.webp'):
        target = 'public/assets/' + part
        original = target.replace('AggroBot', 'Aggrobot')
        source_path = repo / original
        require(source_path.is_file(), f'Missing legacy Gekko artwork: {original}')
        dest_path = repo / target
        if not dest_path.is_file():
            changed[target] = source_path.read_bytes()
        else:
            require(dest_path.read_bytes() == source_path.read_bytes(),
                    f'Existing Gekko artwork conflicts with upstream alias: {target}')

    require(changed, 'Nothing to update; your checkout may already have these changes.')
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, content in sorted(changed.items()):
            require('listen-in' not in name and 'node-vibrant' not in name,
                    f'Unexpected live comms dependency included: {name}')
            z.writestr(name, content)
    with zipfile.ZipFile(out) as z:
        require(z.testzip() is None, 'ZIP verification failed')
        require(sorted(z.namelist()) == sorted(changed), 'ZIP manifest mismatch')
    return sorted(changed)



def fetch_fork_snapshot(target: Path) -> None:
    """Fetch only necessary files from the pinned public fork commit."""
    text_files = [
        'src/app/services/agentName.service.ts',
        'src/app/overlays/testing-agent-select/testing-agent-select.component.ts',
        'src/app/overlays/testing/testing.component.ts',
        'src/app/services/i18nHelper.ts',
        'src/app/services/dataModel.service.ts',
        'src/styles.css',
    ]
    old_images = [
        'public/assets/ability1/AggrobotAbility1.webp',
        'public/assets/ability2/AggrobotAbility2.webp',
        'public/assets/agent-portraits/AggrobotPortrait.webp',
        'public/assets/agents/AggrobotIcon.webp',
        'public/assets/grenades/AggrobotGrenade.webp',
        'public/assets/ultimates/AggrobotUltimate.webp',
        'public/assets/agents/PaprikaIcon.webp',
    ]
    base = (
        'https://raw.githubusercontent.com/'
        'ianmdesign/PCMT-Spectra-Frontend-Nobii/' + GITHUB_FORK_HEAD + '/'
    )
    for index, path in enumerate(text_files + old_images, 1):
        print(f'Fetching fork file {index}/{len(text_files) + len(old_images)}: {path}')
        request = urllib.request.Request(base + path, headers={
            'User-Agent': 'PCMT-Spectra-non-livecomms-update-builder/1.0',
        })
        with urllib.request.urlopen(request, timeout=35) as response:
            data = response.read()
        require(len(data) > 0, f'Empty GitHub file: {path}')
        out = target / path
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(data)

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('repo', nargs='?', default='.', help='PCMT Spectra fork checkout directory')
    parser.add_argument('--from-github', action='store_true',
                        help='Download only the required files from the pinned GitHub fork; no local checkout needed')
    parser.add_argument('--output', default='PCMT_Spectra_Updated_Files.zip',
                        help='Output file (default: PCMT_Spectra_Updated_Files.zip)')
    args = parser.parse_args()
    out = Path(args.output).resolve()
    try:
        if args.from_github:
            with tempfile.TemporaryDirectory(prefix='pcmt-spectra-update-') as tmp:
                repo = Path(tmp)
                fetch_fork_snapshot(repo)
                changed = make_zip(repo, out)
        else:
            repo = Path(args.repo).resolve()
            changed = make_zip(repo, out)
    except Exception as exc:
        print(f'Cannot build update ZIP: {exc}', file=sys.stderr)
        return 1
    print(f'Created: {out}\n{len(changed)} replacement/new files:')
    for name in changed:
        print('  ' + name)
    print('Extract the generated ZIP over the root of the PCMT Spectra fork to apply.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
