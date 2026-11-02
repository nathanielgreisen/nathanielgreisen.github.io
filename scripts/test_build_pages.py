from pathlib import Path
import unittest
from scripts.build_pages import is_public


class PagesArtifactTests(unittest.TestCase):
    def test_portfolio_and_existing_homework_assets_are_kept(self):
        for name in ['index.html', 'style.css', 'script.js', 'CNAME',
                     'CSCI3210/HW1/index.html', 'CSCI3210/HW3/build/static/js/main.js',
                     'CSCI3210/HW3/public/manifest.json']:
            with self.subTest(name=name):
                self.assertTrue(is_public(Path(name)))

    def test_private_and_server_files_are_not_published(self):
        for name in ['.env', '.env.production.local', '.git/config', 'render.yaml',
                     'README.md', 'package-lock.json', 'node_modules/package/index.js',
                     'CSCI3210/HW3/node_modules/package/index.js',
                     'CSCI3210/MIDTERM/pixel-war/backend/.env',
                     'CSCI3210/MIDTERM/pixel-war/backend/config/settings.py',
                     'CSCI3210/MIDTERM/pixel-war/backend/db.sqlite3',
                     'CSCI3210/MIDTERM/pixel-war/frontend/index.html',
                     'CSCI3210/MIDTERM/pixel-war/frontend/.env.production.local']:
            with self.subTest(name=name):
                self.assertFalse(is_public(Path(name)))


if __name__ == '__main__':
    unittest.main()
