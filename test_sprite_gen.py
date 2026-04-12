import sys
import os
import json
import logging

# Add backend dir to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

# Mock the ADMIN_SQLITE_PATH and other dependencies if needed, 
# but we can just import the class and test its internal methods.
from src.grid.sprites import SpriteGenerator

gen = SpriteGenerator(128)

# House icon (viewBox 0 0 24 24)
base_house = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill="currentColor"/></svg>'
# Solar panel overlay (raw elements as saved by editor)
overlay_panel = '<rect x="73.8" y="3.8" width="22.5" height="22.5" fill="#2C3E50" transform="translate(-10, 10)"/>'

overrides = [{"svg": overlay_panel, "mode": "add"}]
color = "#ff0000"

processed = gen._process_svg(base_house, color=color, overrides=overrides)
print("--- PROCESSED SVG ---")
print(processed)
print("---------------------")

# Test rendering
try:
    img = gen._render_svg_to_image(processed)
    print(f"RENDER SUCCESS: {img.width}x{img.height}")
    # Check if image is all transparent
    extrema = img.getextrema()
    print(f"EXTREMA (Alpha): {extrema[3]}")
    if extrema[3][1] == 0:
        print("WARNING: Image is completely transparent!")
except Exception as e:
    print(f"RENDER FAILED: {e}")
