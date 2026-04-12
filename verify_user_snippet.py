import sys
import os
import re
import json
from io import BytesIO
from PIL import Image

# Add backend dir to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from src.grid.sprites import SpriteGenerator

gen = SpriteGenerator(128)

# The user's snippet (slightly cleaned but preserving the structure they showed)
problematic_overlay = '<g xmlns="http://www.w3.org/2000/svg"><g xmlns="http://www.w3.org/2000/svg" transform="translate(-1.65, 5.31)"><g xmlns="http://www.w3.org/2000/svg" transform="translate(20.66, -34.98)"> <g xmlns="http://www.w3.org/2000/svg" id="group-0" transform="translate(-49.24, 50.73)"> <rect x="73.8" y="3.8" width="22.5" height="22.5" fill="#2C3E50"/> </g> </g></g></g>'

base_house = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill="currentColor"/></svg>'

processed = gen._process_svg(base_house, color="#339af0", overrides=[{"svg": problematic_overlay, "mode": "add"}])
print("PROCESSED SVG:")
print(processed)

try:
    img = gen._render_svg_to_image(processed)
    extrema = img.getextrema()
    print(f"Alpha Extrema: {extrema[3]}")
    if extrema[3][1] > 0:
        print("RESULT: SUCCESS")
        img.save("verify_problematic.png")
    else:
        print("RESULT: FAILED (Invisible)")
except Exception as e:
    print(f"RESULT: ERROR ({e})")
