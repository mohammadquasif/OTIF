"""Desktop wrapper script for PyInstaller entrypoint."""
import sys
import os

# Ensure MEIPASS or local root is in path
if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    sys.path.insert(0, sys._MEIPASS)
else:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.desktop_server import main

if __name__ == "__main__":
    main()
