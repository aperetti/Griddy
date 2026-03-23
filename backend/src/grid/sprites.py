import os
import json
import sqlite3
import math
from io import BytesIO
from typing import List, Dict, Any, Tuple
from PIL import Image
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPM
import xml.etree.ElementTree as ET

from src.shared.dependencies import ADMIN_SQLITE_PATH

# Standard SVGs from GridMap.tsx frontend
DEFAULT_SVGS = {
    "open_switch": '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><line x1="30" y1="10" x2="30" y2="90" stroke="currentColor" stroke-width="8" stroke-linecap="round" /><line x1="70" y1="10" x2="70" y2="90" stroke="currentColor" stroke-width="8" stroke-linecap="round" /></svg>',
    "closed_switch": '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><line x1="30" y1="10" x2="30" y2="90" stroke="currentColor" stroke-width="8" stroke-linecap="round" /><line x1="70" y1="10" x2="70" y2="90" stroke="currentColor" stroke-width="8" stroke-linecap="round" /><line x1="15" y1="65" x2="85" y2="35" stroke="currentColor" stroke-width="8" stroke-linecap="round" /></svg>',
    "transformer": '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><polygon points="50,15 15,85 85,85" stroke="currentColor" fill="none" stroke-width="8" stroke-linejoin="round" /></svg>',
    "capacitor": '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="currentColor" font-family="Arial, sans-serif" font-weight="bold" font-size="12">C</text></svg>'
}

class SpriteGenerator:
    def __init__(self, item_size: int = 128):
        self.item_size = item_size

    def _process_svg(self, svg_str: str, color: str = None, css: str = None) -> str:
        """Inject color and CSS into SVG string."""
        if not svg_str:
            return ""

        # Normalize SVG if it's just content or needs viewBox
        if not svg_str.startswith("<svg"):
            svg_str = f'<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">{svg_str}</svg>'

        # Inject CSS
        if css and css.strip():
            style_block = f'<style>{css}</style>'
            if "</svg>" in svg_str:
                svg_str = svg_str.replace("</svg>", f"{style_block}</svg>")
            else:
                svg_str = f"{svg_str}{style_block}"

        if color:
            # Replace currentColor
            svg_str = svg_str.replace("currentColor", color)
            
            # Simple attribute injection (Pillow/svglib doesn't support complex CSS selectors well)
            # We trust the user provided good SVGs or we use basic replacement
            if 'fill="' not in svg_str and 'stroke="' not in svg_str:
                 svg_str = svg_str.replace("<svg", f'<svg fill="{color}" stroke="{color}"')

        return svg_str

    def _render_svg_to_image(self, svg_str: str) -> Image.Image:
        """Render SVG string to a PIL Image."""
        try:
            # Handle empty or invalid SVG
            if not svg_str:
                return Image.new("RGBA", (self.item_size, self.item_size), (0, 0, 0, 0))

            drawing = svg2rlg(BytesIO(svg_str.encode("utf-8")))
            if drawing is None:
                return Image.new("RGBA", (self.item_size, self.item_size), (255, 0, 0, 50))

            # Scale drawing to fit item_size
            scale_x = self.item_size / drawing.width
            scale_y = self.item_size / drawing.height
            scale = min(scale_x, scale_y) * 0.9 # Leave some padding
            
            drawing.scale(scale, scale)
            # Center it
            drawing.shift((self.item_size - drawing.width * scale) / 2, (self.item_size - drawing.height * scale) / 2)

            # Render to PNG in memory
            img_data = renderPM.drawToString(drawing, fmt="PNG")
            img = Image.open(BytesIO(img_data)).convert("RGBA")
            
            # Ensure it is exactly the right size
            if img.size != (self.item_size, self.item_size):
                final_img = Image.new("RGBA", (self.item_size, self.item_size), (0, 0, 0, 0))
                final_img.paste(img, (0, 0))
                return final_img
            
            return img
        except Exception as e:
            print(f"Error rendering SVG: {e}")
            # Return a red square on error
            img = Image.new("RGBA", (self.item_size, self.item_size), (255, 0, 0, 100))
            return img

    def generate(self) -> Tuple[bytes, Dict[str, Any]]:
        """Generate sprite sheet and metadata."""
        items = []
        
        # 1. Add Defaults
        for key, svg in DEFAULT_SVGS.items():
            items.append({
                "id": f"default_{key}",
                "svg": self._process_svg(svg, color="white"),
                "name": f"Default {key}"
            })

        # 2. Add Rules from DB
        try:
            with sqlite3.connect(ADMIN_SQLITE_PATH) as conn:
                conn.row_factory = sqlite3.Row
                rules = conn.execute("SELECT * FROM display_config_rules WHERE enabled = 1 AND icon IS NOT NULL").fetchall()
                for rule in rules:
                    d = dict(rule)
                    items.append({
                        "id": f"rule_{d['id']}",
                        "svg": self._process_svg(d['icon'], color=d.get('color_hex'), css=d.get('css_overrides')),
                        "name": d['name']
                    })
        except Exception as e:
            print(f"Error fetching rules for sprite generation: {e}")

        if not items:
            # Return a tiny empty sprite sheet if nothing to render
            return b"", {}

        # 3. Pack into Sprite Sheet
        num_items = len(items)
        cols = math.ceil(math.sqrt(num_items))
        rows = math.ceil(num_items / cols)
        
        sprite_width = cols * self.item_size
        sprite_height = rows * self.item_size
        
        sprite_sheet = Image.new("RGBA", (sprite_width, sprite_height), (0, 0, 0, 0))
        mapping = {}

        for idx, item in enumerate(items):
            row = idx // cols
            col = idx % cols
            x = col * self.item_size
            y = row * self.item_size
            
            img = self._render_svg_to_image(item["svg"])
            sprite_sheet.paste(img, (x, y))
            
            mapping[item["id"]] = {
                "x": x,
                "y": y,
                "width": self.item_size,
                "height": self.item_size,
                "anchorX": self.item_size // 2,
                "anchorY": self.item_size // 2,
                "name": item["name"]
            }

        # 4. Save to Bytes
        output = BytesIO()
        sprite_sheet.save(output, format="PNG")
        return output.getvalue(), mapping

generator = SpriteGenerator()
