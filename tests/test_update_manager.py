from pathlib import Path

from app.services.update_manager import CURRENT_VERSION, UpdateManager, _version_tuple


def test_update_version_parser_is_semantic() -> None:
    assert CURRENT_VERSION == "2.7.2"
    assert _version_tuple("auralive-2.7.2-native") == (2, 7, 2)
    assert _version_tuple("bad-tag") == (0, 0, 0)


def test_release_info_accepts_only_matching_installer_version(tmp_path: Path) -> None:
    manager = UpdateManager()
    manager.directory = tmp_path
    payload = {
        "tag_name": "auralive-2.7.3-native",
        "html_url": "https://github.com/XDSawyerLoL/Auralive/releases/tag/auralive-2.7.3-native",
        "published_at": "2026-09-21T10:00:00Z",
        "assets": [
            {
                "name": "AuraLive-Setup-9.9.9.exe",
                "browser_download_url": "https://github.com/XDSawyerLoL/Auralive/releases/download/auralive-2.7.3-native/AuraLive-Setup-9.9.9.exe",
                "digest": "sha256:" + ("0" * 64),
                "size": 123,
            },
            {
                "name": "AuraLive-Setup-2.7.3.exe",
                "browser_download_url": "https://github.com/XDSawyerLoL/Auralive/releases/download/auralive-2.7.3-native/AuraLive-Setup-2.7.3.exe",
                "digest": "sha256:" + ("a" * 64),
                "size": 456,
            },
        ],
    }

    info = manager._release_info(payload)

    assert info["latest_version"] == "2.7.3"
    assert info["update_available"] is True
    assert info["installer_available"] is True
    assert info["installer"]["name"] == "AuraLive-Setup-2.7.3.exe"
    assert info["installer"]["digest"] == "sha256:" + ("a" * 64)


def test_release_info_rejects_mismatched_installer(tmp_path: Path) -> None:
    manager = UpdateManager()
    manager.directory = tmp_path
    info = manager._release_info(
        {
            "tag_name": "auralive-2.7.3-native",
            "assets": [
                {
                    "name": "AuraLive-Setup-2.7.4.exe",
                    "browser_download_url": "https://github.com/example.exe",
                }
            ],
        }
    )
    assert info["update_available"] is True
    assert info["installer_available"] is False
    assert info["installer"] is None


def test_digest_from_github_asset_is_used_without_network(tmp_path: Path) -> None:
    manager = UpdateManager()
    manager.directory = tmp_path
    expected = "b" * 64
    assert manager._expected_sha256(
        {
            "installer": {
                "name": "AuraLive-Setup-2.7.3.exe",
                "digest": f"sha256:{expected}",
            }
        }
    ) == expected
