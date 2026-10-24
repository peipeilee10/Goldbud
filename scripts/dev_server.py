"""本機開發用的靜態伺服器：和 python -m http.server 一樣，但告訴瀏覽器不要暫存，
改完檔案重新整理就能看到最新版。

    python3 scripts/dev_server.py        # http://localhost:8765
"""

import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(os.path.join(os.path.dirname(__file__), ".."))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler) as httpd:
        print(f"小金芽：http://localhost:{port}")
        httpd.serve_forever()
