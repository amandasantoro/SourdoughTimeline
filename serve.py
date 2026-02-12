#!/usr/bin/env python3
"""
Simple HTTP server for Sourdough Timeline
Run this script to start a local server at http://localhost:8000
"""

import http.server
import socketserver
import webbrowser
import os

PORT = 8000

# Change to the script's directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))

Handler = http.server.SimpleHTTPRequestHandler

# Add MIME types for proper file serving
Handler.extensions_map.update({
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.md': 'text/markdown',
    '.css': 'text/css',
    '.html': 'text/html',
})

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    url = f"http://localhost:{PORT}"
    print(f"🍞 Sourdough Timeline Server")
    print(f"   Serving at: {url}")
    print(f"   Press Ctrl+C to stop")
    print()
    
    # Open browser automatically
    webbrowser.open(url)
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 Server stopped. Happy baking!")
