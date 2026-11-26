"""Publish the Vite client build from the repository root using AWS CLI v2."""

import argparse
import os
from pathlib import Path
import re
import subprocess


client = Path("dist/client")
index = client / "index.html"
licenses = {"licenses/Doto-OFL.txt", "licenses/Onest-OFL.txt"}
asset = re.compile(r"assets/[\w][\w.-]*-[\w-]{8}\.(js|css|woff2)", re.ASCII)
mime_types = {"js": "text/javascript", "css": "text/css", "woff2": "font/woff2"}


def publication():
    objects = []
    if not index.is_file() or not any((client / "assets").glob("*.js")):
        raise SystemExit("Missing production build in dist/client")
    if Path("public/assets").exists():
        raise SystemExit("Reserve assets/ for content-hashed Vite output")
    for path in sorted(client.rglob("*")):
        key = path.relative_to(client).as_posix()
        if path.is_symlink():
            raise SystemExit(f"Unexpected symbolic link: {key}")
        if path.is_dir() or key == ".vite/manifest.json" or path == index:
            continue
        match = asset.fullmatch(key)
        if match:
            objects.append((key, mime_types[match[1]], "public, max-age=31536000, immutable"))
        elif key in licenses:
            objects.append((key, "text/plain; charset=utf-8", "public, max-age=3600"))
        else:
            raise SystemExit(f"Unexpected build output: {key}")
    if not licenses.issubset(key for key, _, _ in objects):
        raise SystemExit("Missing font license in dist/client/licenses")
    objects.append(("index.html", "text/html; charset=utf-8", "no-cache"))
    return objects


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dryrun", action="store_true", help="preview uploads without writing")
    args = parser.parse_args()
    bucket = os.environ.get("S3_BUCKET", "")
    if not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", bucket):
        raise SystemExit("Set S3_BUCKET to the bucket name")
    for key, mime, cache_control in publication():
        command = [
            "aws", "--endpoint-url", "https://storage.yandexcloud.net", "--region", "ru-central1",
            "s3", "cp", str(client / key), f"s3://{bucket}/{key}",
            "--content-type", mime, "--cache-control", cache_control, "--no-progress",
        ]
        if args.dryrun:
            command.append("--dryrun")
        subprocess.run(command, check=True)


if __name__ == "__main__":
    main()
