"""Local secret protection helpers.

Windows desktop builds use DPAPI so API keys are bound to the current user.
Other platforms still restrict file permissions and keep a format marker so a
stronger keychain backend can be added without changing callers.
"""
from __future__ import annotations

import base64
import ctypes
import os
from ctypes import wintypes
from pathlib import Path


class _DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def _dpapi_protect(value: str) -> str | None:
    if os.name != "nt" or not value:
        return None
    data = value.encode("utf-8")
    in_blob = _DATA_BLOB(len(data), ctypes.cast(ctypes.create_string_buffer(data), ctypes.POINTER(ctypes.c_char)))
    out_blob = _DATA_BLOB()
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    if not crypt32.CryptProtectData(
        ctypes.byref(in_blob),
        None,
        None,
        None,
        None,
        0,
        ctypes.byref(out_blob),
    ):
        return None
    try:
        protected = ctypes.string_at(out_blob.pbData, out_blob.cbData)
        return "dpapi:" + base64.b64encode(protected).decode("ascii")
    finally:
        kernel32.LocalFree(out_blob.pbData)


def _dpapi_unprotect(value: str) -> str | None:
    if os.name != "nt" or not value.startswith("dpapi:"):
        return None
    raw = base64.b64decode(value.split(":", 1)[1])
    in_blob = _DATA_BLOB(len(raw), ctypes.cast(ctypes.create_string_buffer(raw), ctypes.POINTER(ctypes.c_char)))
    out_blob = _DATA_BLOB()
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    if not crypt32.CryptUnprotectData(
        ctypes.byref(in_blob),
        None,
        None,
        None,
        None,
        0,
        ctypes.byref(out_blob),
    ):
        return None
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData).decode("utf-8")
    finally:
        kernel32.LocalFree(out_blob.pbData)


def protect_secret(value: str) -> str:
    if not value:
        return ""
    protected = _dpapi_protect(value)
    if protected:
        return protected
    return "local:" + base64.b64encode(value.encode("utf-8")).decode("ascii")


def unprotect_secret(value: str) -> str:
    if not value:
        return ""
    if value.startswith("dpapi:"):
        return _dpapi_unprotect(value) or ""
    if value.startswith("local:"):
        try:
            return base64.b64decode(value.split(":", 1)[1]).decode("utf-8")
        except Exception:
            return ""
    return value


def restrict_secret_file(path: Path) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        os.chmod(path, 0o600)
    except OSError:
        pass
