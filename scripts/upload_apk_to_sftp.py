import argparse
from pathlib import Path

import paramiko


def ensure_remote_dir(sftp: paramiko.SFTPClient, remote_dir: str) -> None:
    parts = [part for part in remote_dir.replace("\\", "/").split("/") if part]
    if remote_dir.startswith("/"):
        sftp.chdir("/")

    for part in parts:
        try:
            sftp.chdir(part)
        except OSError:
            sftp.mkdir(part)
            sftp.chdir(part)


def main() -> None:
    parser = argparse.ArgumentParser(description="Upload signed Strand APK files to SFTP.")
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, default=22)
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--remote-dir", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--apk", required=True)
    parser.add_argument("--latest-apk", required=True)
    args = parser.parse_args()

    apk = Path(args.apk)
    latest_apk = Path(args.latest_apk)
    if not apk.is_file():
        raise FileNotFoundError(apk)
    if not latest_apk.is_file():
        raise FileNotFoundError(latest_apk)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=args.host,
        port=args.port,
        username=args.username,
        password=args.password,
        timeout=30,
    )

    try:
        sftp = client.open_sftp()
        try:
            ensure_remote_dir(sftp, args.remote_dir)
            versioned_name = f"strand-{args.version}.apk"
            sftp.put(str(apk), versioned_name)
            sftp.put(str(latest_apk), "strand-latest.apk")
            print(f"Uploaded {versioned_name} and strand-latest.apk to {args.remote_dir}")
        finally:
            sftp.close()
    finally:
        client.close()


if __name__ == "__main__":
    main()
