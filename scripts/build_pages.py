"""Assemble the public portfolio and compiled MIDTERM app, never backend files."""
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / '_site'
DIST = ROOT / 'CSCI3210/MIDTERM/pixel-war/frontend/dist'
PUBLIC_EXTENSIONS = {
    '.html', '.css', '.js', '.json', '.svg', '.png', '.jpg', '.jpeg', '.gif',
    '.webp', '.avif', '.ico', '.txt', '.pdf', '.mp3', '.mp4', '.webm',
    '.woff', '.woff2', '.ttf', '.otf',
}


def is_public(path):
    if any(part.startswith('.') for part in path.parts):
        return False
    if path.parts[:2] == ('CSCI3210', 'MIDTERM'):
        return False  # Only the compiled app is published here.
    if len(path.parts) > 1 and path.parts[0] != 'CSCI3210':
        return False
    if any(part in {'node_modules', '__pycache__', 'backend'} for part in path.parts):
        return False
    if path.name in {'package.json', 'package-lock.json', 'CNAME'}:
        return path.name == 'CNAME'
    return path.suffix.lower() in PUBLIC_EXTENSIONS


def main():
    if not (DIST / 'index.html').is_file():
        raise SystemExit('Build the MIDTERM frontend with npm run build first.')
    if SITE.is_symlink():
        raise SystemExit('Refusing to replace a symlink at _site.')
    if SITE.exists():
        shutil.rmtree(SITE)
    SITE.mkdir()
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    for name in filter(None, tracked):
        relative = Path(name)
        source = ROOT / relative
        if is_public(relative) and source.is_file() and not source.is_symlink():
            destination = SITE / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
    shutil.copytree(DIST, SITE / 'CSCI3210/MIDTERM')
    (SITE / '.nojekyll').touch()
    print('Pages artifact ready at _site/. MIDTERM is at /CSCI3210/MIDTERM/.')


if __name__ == '__main__':
    main()
