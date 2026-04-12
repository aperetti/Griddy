import sys
import os
import re
import json
import logging
from io import BytesIO
from PIL import Image

# Add backend dir to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from src.grid.sprites import SpriteGenerator

gen = SpriteGenerator(128)

def test_combination(name, base, overlay):
    print(f"\n=== TESTING: {name} ===")
    processed = gen._process_svg(base, color="#339af0", overrides=[{"svg": overlay, "mode": "add"}])
    print("PROCESSED SVG:")
    print(processed)
    
    try:
        img = gen._render_svg_to_image(processed)
        extrema = img.getextrema()
        print(f"Alpha Extrema: {extrema[3]}")
        if extrema[3][1] > 0:
            print("RESULT: SUCCESS (Icon rendered)")
            # Save for visual inspection if needed
            img.save(f"verify_{name}.png")
        else:
            print("RESULT: FAILED (Icon is empty/transparent)")
    except Exception as e:
        print(f"RESULT: ERROR ({e})")

# Case 1: Standard Full SVG Base + Raw Overlay
test_combination(
    "standard_full",
    '<svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill="currentColor"/></svg>',
    '<rect x="10" y="10" width="50" height="50" fill="red" />'
)

# Case 2: Raw Content Base (What happens if saved back) + Raw Overlay
test_combination(
    "raw_base",
    '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" fill="currentColor"/>',
    '<rect x="10" y="10" width="50" height="50" fill="red" />'
)

# Case 3: Base with nested groups (What the user showed)
test_combination(
    "nested_base",
    '<g transform="translate(10,10)"><path d="M0 0h10v10H0z"/></g>',
    '<circle cx="50" cy="50" r="20" fill="green" />'
)
