"""Puts ?v=<hash of every .js and .css> after each of them in the pages, so a browser loads the new ones after a push.
Run it before every commit: python3 stamp.py"""
import hashlib
import re
from pathlib import Path

root = Path(__file__).parent
assets = sorted(p for p in root.rglob("*") if p.suffix in (".js", ".css") and ".git" not in p.parts)
version = hashlib.sha1(b"".join(p.read_bytes() for p in assets)).hexdigest()[:8]
for page in root.rglob("*.html"):
    text = page.read_text()
    stamped = re.sub(r'((?:src|href)="(?!https?:)[^"?]+\.(?:js|css))(?:\?v=\w+)?"', rf'\1?v={version}"', text)
    if stamped != text:
        page.write_text(stamped)
print(version)
