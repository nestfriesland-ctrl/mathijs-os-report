"""
Telegram push module for mathijs-os v2.

Usage:
    from lib.telegram import TG
    tg = TG()                    # auto-loads from env
    tg.push("Hello world")       # plain text
    tg.push_html("<b>Bold</b>")  # HTML formatted
    tg.push_report(html_str)     # sends as document
"""
from __future__ import annotations

import json
import os
import urllib.request
import urllib.parse
import tempfile
from pathlib import Path

# Config file for persisted chat_id
_CONFIG_PATH = Path(__file__).parent.parent / ".tg_config.json"


def _env(key: str) -> str:
    val = os.environ.get(key, "")
    if not val:
        raise RuntimeError(f"Missing env var: {key}")
    return val


class TG:
    """Minimal Telegram Bot API client. No dependencies beyond stdlib."""

    def __init__(self, token: str | None = None, chat_id: str | None = None):
        self.token = token or _env("TG_BOT_TOKEN")
        self.base = f"https://api.telegram.org/bot{self.token}"
        self.chat_id = chat_id or os.environ.get("TG_CHAT_ID") or self._load_chat_id()

    # --- public API ---

    def push(self, text: str, silent: bool = False) -> dict:
        """Send a plain text message."""
        return self._send_message(text, parse_mode=None, silent=silent)

    def push_html(self, html: str, silent: bool = False) -> dict:
        """Send an HTML-formatted message (TG subset: b, i, code, pre, a)."""
        return self._send_message(html, parse_mode="HTML", silent=silent)

    def push_report(self, html_content: str, filename: str = "report.html") -> dict:
        """Send an HTML file as a document."""
        with tempfile.NamedTemporaryFile(suffix=".html", delete=False, mode="w") as f:
            f.write(html_content)
            tmp = f.name
        try:
            return self._send_document(tmp, filename)
        finally:
            os.unlink(tmp)

    def detect_chat_id(self) -> str:
        """Poll getUpdates to find the chat_id. User must send /start first."""
        data = self._api("getUpdates", {"limit": 10, "timeout": 0})
        for update in data.get("result", []):
            msg = update.get("message", {})
            chat = msg.get("chat", {})
            if chat.get("type") == "private":
                cid = str(chat["id"])
                self._save_chat_id(cid)
                self.chat_id = cid
                return cid
        raise RuntimeError(
            "No private chat found. Send /start to @mathijsdeluxebot first, "
            "then call detect_chat_id() again."
        )

    # --- internals ---

    def _send_message(self, text: str, parse_mode: str | None, silent: bool) -> dict:
        self._require_chat_id()
        params = {"chat_id": self.chat_id, "text": text}
        if parse_mode:
            params["parse_mode"] = parse_mode
        if silent:
            params["disable_notification"] = True
        return self._api("sendMessage", params)

    def _send_document(self, filepath: str, filename: str) -> dict:
        self._require_chat_id()
        import mimetypes
        boundary = "----MathijsOS"
        lines = []
        # chat_id field
        lines.append(f"--{boundary}")
        lines.append('Content-Disposition: form-data; name="chat_id"')
        lines.append("")
        lines.append(self.chat_id)
        # file field
        lines.append(f"--{boundary}")
        lines.append(f'Content-Disposition: form-data; name="document"; filename="{filename}"')
        lines.append(f"Content-Type: {mimetypes.guess_type(filename)[0] or 'text/html'}")
        lines.append("")

        header = "\r\n".join(lines).encode() + b"\r\n"
        with open(filepath, "rb") as f:
            file_data = f.read()
        footer = f"\r\n--{boundary}--\r\n".encode()

        body = header + file_data + footer
        url = f"{self.base}/sendDocument"
        req = urllib.request.Request(
            url, data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())

    def _api(self, method: str, params: dict | None = None) -> dict:
        url = f"{self.base}/{method}"
        data = urllib.parse.urlencode(params or {}).encode()
        req = urllib.request.Request(url, data=data, method="POST")
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
        if not result.get("ok"):
            raise RuntimeError(f"TG API error: {result}")
        return result

    def _require_chat_id(self):
        if not self.chat_id:
            raise RuntimeError(
                "No chat_id configured. Either:\n"
                "  1. Set TG_CHAT_ID env var\n"
                "  2. Call tg.detect_chat_id() after sending /start to the bot"
            )

    def _load_chat_id(self) -> str | None:
        if _CONFIG_PATH.exists():
            cfg = json.loads(_CONFIG_PATH.read_text())
            return cfg.get("chat_id")
        return None

    def _save_chat_id(self, cid: str):
        cfg = {}
        if _CONFIG_PATH.exists():
            cfg = json.loads(_CONFIG_PATH.read_text())
        cfg["chat_id"] = cid
        _CONFIG_PATH.write_text(json.dumps(cfg, indent=2))
